"""mcp-server-docker plus one tool it does not ship: exec_container.

Mounted into every docker-<host> MCPServer (./../docker/base/mcpserver.yaml)
as the toolhive-docker-mcp-server ConfigMap, and run with the pinned
mcp-server-docker package's interpreter (`uv tool run --from ... python`).

The upstream package (github.com/ckreiling/mcp-server-docker) covers
containers, images, networks and volumes but has no `docker exec`, so
anything that needs a command inside a Dockge container (`netbird status`,
re-applying a sidecar setting, reading a file) had no path through the MCP.
The Docker API side was never the gate: each host's docker-socket-proxy
already allows EXEC (docker/_common/docker-socket-proxy/compose.yaml).

The tool registers on the package's own `app` and reaches the Docker client
through the package's lifespan context, the same way every upstream tool
does. Then this runs the exact app.run(...) line the MCPServer used to pass
via `python -c`: streamable-http, stateless (see the base's header for why).
"""

from typing import Annotated, Any

from mcp.server.mcpserver import Context
from mcp.types import ToolAnnotations
from mcp_server_docker import app
from mcp_server_docker.server import AppContext, _client
from pydantic import Field

# Per stream. The result goes back through toolport into an agent's context,
# and a runaway `cat` should not ship megabytes; the tail is the useful end of
# most command output.
MAX_OUTPUT_BYTES = 64 * 1024


def _decode(raw: bytes | None) -> tuple[str, bool]:
    if not raw:
        return "", False
    truncated = len(raw) > MAX_OUTPUT_BYTES
    if truncated:
        raw = raw[-MAX_OUTPUT_BYTES:]
    return raw.decode("utf-8", errors="replace"), truncated


@app.tool(
    description=(
        "Run a command inside a running container (docker exec) and return its"
        " exit code, stdout and stderr. Non-interactive: no TTY, no stdin. The"
        " command is an argv list and is NOT run through a shell; use"
        ' ["sh", "-c", "..."] for pipes or redirects. Blocks until the command'
        " exits, so do not start long-running processes. Output is capped at"
        f" {MAX_OUTPUT_BYTES // 1024} KiB per stream (the tail is kept)."
    ),
    annotations=ToolAnnotations(
        read_only_hint=False,
        destructive_hint=True,
        idempotent_hint=False,
        open_world_hint=False,
    ),
)
def exec_container(
    ctx: Context[AppContext],
    container_id: Annotated[str, Field(description="Container ID or name")],
    command: Annotated[
        list[str],
        Field(description='Command argv, e.g. ["netbird", "status"]', min_length=1),
    ],
    user: Annotated[
        str | None,
        Field(description="User to run as (name or uid[:gid]); default is the container's user"),
    ] = None,
    workdir: Annotated[
        str | None, Field(description="Working directory inside the container")
    ] = None,
    environment: Annotated[
        dict[str, str] | None,
        Field(description="Extra environment variables for this command only"),
    ] = None,
) -> dict[str, Any]:
    container = _client(ctx).containers.get(container_id)
    result = container.exec_run(
        command,
        stdout=True,
        stderr=True,
        stdin=False,
        tty=False,
        demux=True,
        user=user or "",
        workdir=workdir,
        environment=environment,
    )
    out, err = result.output if result.output else (None, None)
    stdout, stdout_truncated = _decode(out)
    stderr, stderr_truncated = _decode(err)
    return {
        "container": container.name,
        "exit_code": result.exit_code,
        "stdout": stdout,
        "stderr": stderr,
        "truncated": stdout_truncated or stderr_truncated,
    }


app.run("streamable-http", host="0.0.0.0", port=8000, stateless_http=True)
