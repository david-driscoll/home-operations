#!/usr/bin/env -S dotnet run
// SuperSync coordinator: authentik decides WHO, this file turns that into a
// SuperSync account and access token.
//
// SuperSync (packages/super-sync-server upstream) only knows passkeys and
// emailed magic links. Neither is wanted here, and it has no trusted-header or
// OIDC mode. What makes this sidecar possible is how narrow its token check is
// (src/auth.ts `verifyToken`, read at master-069d07a):
//
//   1. the JWT verifies under JWT_SECRET (jsonwebtoken, HS256 for a string key);
//   2. `users` has a row with that `userId`, `is_verified = 1`;
//   3. the token's `tokenVersion` equals that row's `token_version`.
//
// Nothing else -- not how the token was issued, not the login method. So this
// app shares JWT_SECRET and the database, reads the caller's email from the
// header the authentik outpost injects, makes sure a verified `users` row
// exists for it, and signs the same `{userId, email, tokenVersion}` payload
// SuperSync would. The Super Productivity apps take that token pasted into
// Settings -> Sync, exactly as they take one from SuperSync's own login page.
//
// TRUST: the email header is only as good as the path to this pod. The
// HTTPRoute sends it here through `authenticated-user` (the outpost overwrites
// X-authentik-email), and ../ciliumnetworkpolicy.yaml admits nothing but
// Traefik. Those two and this file go together -- see navidrome for the same
// shape.
//
// Only four columns are touched: users.email, is_verified, token_version and
// storage_quota_bytes. If an image bump ever renames one, /token starts
// answering 500 and SuperSync itself keeps syncing existing devices.
#:sdk Microsoft.NET.Sdk.Web
#:package Npgsql@10.0.3

using System.Buffers.Text;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

var config = CoordinatorConfig.FromEnvironment();
builder.Services.AddSingleton(config);
builder.Services.AddSingleton(_ => NpgsqlDataSource.Create(config.ConnectionString));
builder.Services.AddSingleton<Accounts>();

var app = builder.Build();

app.Use(async (ctx, next) =>
{
  // Every response here either is, or leads straight to, a year-long bearer
  // credential. Nothing may cache it and nothing may carry this URL onward.
  ctx.Response.Headers.CacheControl = "no-store";
  ctx.Response.Headers["Referrer-Policy"] = "no-referrer";
  ctx.Response.Headers.XContentTypeOptions = "nosniff";
  ctx.Response.Headers.XFrameOptions = "DENY";
  await next();
});

app.MapGet("/healthz", () => Results.Text("ok"));

app.MapGet("/", (HttpContext ctx) =>
{
  var email = Caller(ctx, config);
  if (email is null)
  {
    return Results.Text("This request carries no authenticated email.", statusCode: 401);
  }

  ctx.Response.Headers.ContentSecurityPolicy =
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'";
  return Results.Content(Page.Render(email, config.PublicUrl), "text/html; charset=utf-8");
});

app.MapPost("/token", (HttpContext ctx, Accounts accounts) => Issue(ctx, accounts, revokeFirst: false));
app.MapPost("/revoke", (HttpContext ctx, Accounts accounts) => Issue(ctx, accounts, revokeFirst: true));

app.Run();

async Task<IResult> Issue(HttpContext ctx, Accounts accounts, bool revokeFirst)
{
  // A custom header is the CSRF guard: a cross-site form cannot set one, and a
  // cross-site fetch that does is preflighted -- and the preflight carries no
  // authentik cookie, so it never gets past the outpost.
  if (ctx.Request.Headers[Page.CsrfHeader].ToString() != "1")
  {
    return Results.Text("Missing request header.", statusCode: 400);
  }

  var email = Caller(ctx, config);
  if (email is null)
  {
    return Results.Text("This request carries no authenticated email.", statusCode: 401);
  }

  var account = await accounts.EnsureAsync(email, ctx.RequestAborted);
  if (revokeFirst)
  {
    account = await accounts.RevokeAsync(account, ctx.RequestAborted);
  }

  var (token, expiresAt) = Jwt.Mint(account, config.JwtSecret, DateTimeOffset.UtcNow);
  return Results.Json(
    new TokenResponse(config.PublicUrl, account.Email, token, expiresAt),
    CoordinatorJson.Default.TokenResponse);
}

static string? Caller(HttpContext ctx, CoordinatorConfig config)
{
  var values = ctx.Request.Headers[config.EmailHeader];
  if (values.Count != 1)
  {
    return null;
  }

  var raw = values[0]?.Trim() ?? "";
  if (raw.Length == 0 || raw.Contains(',') || raw.IndexOf('@') <= 0)
  {
    return null;
  }

  // SuperSync lowercases every email it stores (auth.ts), and `users.email`
  // is UNIQUE -- so this must match its spelling or a mixed-case authentik
  // address would get a second, empty account.
  return raw.ToLowerInvariant();
}

sealed record CoordinatorConfig(
  string JwtSecret,
  string ConnectionString,
  string PublicUrl,
  string EmailHeader,
  long? StorageQuotaBytes)
{
  public static CoordinatorConfig FromEnvironment()
  {
    var secret = Required("JWT_SECRET");
    // SuperSync refuses to boot below 32; a shorter one here would mint tokens
    // for a server that cannot be running.
    if (secret.Length < 32)
    {
      throw new InvalidOperationException("JWT_SECRET must be at least 32 characters.");
    }

    var quota = Environment.GetEnvironmentVariable("STORAGE_QUOTA_BYTES");
    return new CoordinatorConfig(
      JwtSecret: secret,
      ConnectionString: Required("COORDINATOR_DB"),
      PublicUrl: Required("SUPERSYNC_PUBLIC_URL").TrimEnd('/'),
      EmailHeader: Environment.GetEnvironmentVariable("EMAIL_HEADER") is { Length: > 0 } header
        ? header
        : "X-authentik-email",
      StorageQuotaBytes: long.TryParse(quota, out var bytes) && bytes > 0 ? bytes : null);
  }

  static string Required(string name) =>
    Environment.GetEnvironmentVariable(name) is { Length: > 0 } value
      ? value
      : throw new InvalidOperationException($"{name} is not set.");
}

sealed record Account(int Id, string Email, int TokenVersion);

sealed record TokenResponse(string ServerUrl, string Email, string Token, long ExpiresAt);

// File-based apps compile with the trimming/AOT analyzers on, which reject
// reflection-based serialization; a source-generated context satisfies them.
[JsonSerializable(typeof(TokenResponse))]
[JsonSourceGenerationOptions(JsonSerializerDefaults.Web)]
sealed partial class CoordinatorJson : JsonSerializerContext;

sealed class Accounts(NpgsqlDataSource db, CoordinatorConfig config, ILogger<Accounts> log)
{
  public async Task<Account> EnsureAsync(string email, CancellationToken ct)
  {
    // `is_verified = 1` on conflict as well: authentik has just vouched for this
    // address, which is the whole point. `xmax = 0` is true only for a row this
    // statement inserted, which is what the log line below reports.
    //
    // The quota only ever RAISES an existing account's limit, so lowering
    // STORAGE_QUOTA_BYTES never strands someone already over the new value.
    await using var cmd = config.StorageQuotaBytes is { } quota
      ? db.CreateCommand("""
          INSERT INTO users (email, is_verified, storage_quota_bytes)
          VALUES ($1, 1, $2)
          ON CONFLICT (email) DO UPDATE
            SET is_verified = 1,
                storage_quota_bytes = GREATEST(users.storage_quota_bytes, EXCLUDED.storage_quota_bytes)
          RETURNING id, token_version, (xmax = 0) AS created
          """)
      : db.CreateCommand("""
          INSERT INTO users (email, is_verified)
          VALUES ($1, 1)
          ON CONFLICT (email) DO UPDATE SET is_verified = 1
          RETURNING id, token_version, (xmax = 0) AS created
          """);
    cmd.Parameters.Add(new NpgsqlParameter { Value = email });
    if (config.StorageQuotaBytes is { } bytes)
    {
      cmd.Parameters.Add(new NpgsqlParameter { Value = bytes });
    }

    await using var reader = await cmd.ExecuteReaderAsync(ct);
    await reader.ReadAsync(ct);
    var account = new Account(reader.GetInt32(0), email, reader.GetInt32(1));
    if (reader.GetBoolean(2))
    {
      log.LogInformation("Created SuperSync user {UserId}", account.Id);
    }

    return account;
  }

  public async Task<Account> RevokeAsync(Account account, CancellationToken ct)
  {
    // The same write SuperSync's own POST /api/replace-token makes. Its
    // process-local auth cache keeps accepting old tokens for up to 30 seconds.
    await using var cmd = db.CreateCommand(
      "UPDATE users SET token_version = token_version + 1 WHERE id = $1 RETURNING token_version");
    cmd.Parameters.Add(new NpgsqlParameter { Value = account.Id });
    var version = (int)(await cmd.ExecuteScalarAsync(ct))!;
    log.LogInformation("Revoked every token for SuperSync user {UserId}", account.Id);
    return account with { TokenVersion = version };
  }
}

static class Jwt
{
  // jsonwebtoken's `expiresIn: '365d'` (auth.ts JWT_EXPIRY), in seconds.
  const long LifetimeSeconds = 365L * 24 * 60 * 60;

  public static (string Token, long ExpiresAt) Mint(Account account, string secret, DateTimeOffset now)
  {
    var issuedAt = now.ToUnixTimeSeconds();
    var expiresAt = issuedAt + LifetimeSeconds;

    // Written by hand rather than through a JWT library so the claim TYPES are
    // pinned: SuperSync passes `userId` straight to Prisma's
    // `findUnique({ where: { id } })`, which rejects a string with a 500.
    using var payload = new MemoryStream();
    using (var json = new Utf8JsonWriter(payload))
    {
      json.WriteStartObject();
      json.WriteNumber("userId", account.Id);
      json.WriteString("email", account.Email);
      json.WriteNumber("tokenVersion", account.TokenVersion);
      json.WriteNumber("iat", issuedAt);
      json.WriteNumber("exp", expiresAt);
      json.WriteEndObject();
    }

    var signingInput =
      Base64Url.EncodeToString("""{"alg":"HS256","typ":"JWT"}"""u8) + "." +
      Base64Url.EncodeToString(payload.ToArray());
    var signature = HMACSHA256.HashData(
      Encoding.UTF8.GetBytes(secret),
      Encoding.ASCII.GetBytes(signingInput));

    return ($"{signingInput}.{Base64Url.EncodeToString(signature)}", expiresAt * 1000);
  }
}

static class Page
{
  public const string CsrfHeader = "X-SuperSync-Coordinator";

  public static string Render(string email, string serverUrl) =>
    Template
      .Replace("{{EMAIL}}", WebUtility.HtmlEncode(email))
      .Replace("{{SERVER_URL}}", WebUtility.HtmlEncode(serverUrl))
      .Replace("{{CSRF_HEADER}}", CsrfHeader);

  const string Template = """
    <!doctype html>
    <html lang="en">
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SuperSync access</title>
    <style>
      :root { color-scheme: light dark; --bg:#f6f7f9; --card:#fff; --fg:#1d2330; --muted:#5b6475; --line:#d9dde4; --accent:#3366ff; --warn:#b3261e; }
      @media (prefers-color-scheme: dark) { :root { --bg:#111418; --card:#1a1f26; --fg:#e6e9ef; --muted:#9aa3b2; --line:#2c333d; --accent:#7b9cff; --warn:#ff8a80; } }
      * { box-sizing: border-box; }
      body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.5 system-ui, sans-serif; }
      main { max-width:44rem; margin:0 auto; padding:2rem 1rem; }
      .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:1.25rem; margin-bottom:1rem; }
      h1 { font-size:1.4rem; margin:0 0 .25rem; }
      h2 { font-size:1.05rem; margin:0 0 .75rem; }
      p, li { color:var(--muted); }
      label { display:block; font-size:.85rem; color:var(--muted); margin:.75rem 0 .25rem; }
      .row { display:flex; gap:.5rem; }
      input, textarea { flex:1; min-width:0; font:14px ui-monospace, monospace; padding:.55rem .65rem; border:1px solid var(--line); border-radius:8px; background:transparent; color:var(--fg); }
      textarea { width:100%; height:7rem; resize:vertical; word-break:break-all; }
      button { font:inherit; padding:.55rem 1rem; border-radius:8px; border:1px solid var(--accent); background:var(--accent); color:#fff; cursor:pointer; }
      button.secondary { background:transparent; color:var(--accent); }
      button.danger { background:transparent; color:var(--warn); border-color:var(--warn); }
      button:disabled { opacity:.5; cursor:default; }
      #status { min-height:1.5em; }
      [hidden] { display:none !important; }
    </style>
    </head>
    <body>
    <main>
      <div class="card">
        <h1>SuperSync access</h1>
        <p>Signed in as <strong>{{EMAIL}}</strong>. Your Super Productivity data syncs to its own account on this server.</p>
      </div>
      <div class="card">
        <h2>Connect a device</h2>
        <ol>
          <li>In Super Productivity, open <strong>Settings &rarr; Sync</strong> and choose <strong>SuperSync</strong>.</li>
          <li>Expand <strong>Advanced</strong> and set <strong>Server URL</strong> to the value below.</li>
          <li>Paste your token into <strong>Access Token</strong>. The same token works on every device.</li>
        </ol>
        <label for="server">Server URL</label>
        <div class="row"><input id="server" readonly value="{{SERVER_URL}}"><button class="secondary" data-copy="server">Copy</button></div>
        <label for="token">Access token</label>
        <textarea id="token" readonly hidden></textarea>
        <div class="row" style="margin-top:.5rem">
          <button id="get">Show my token</button>
          <button class="secondary" data-copy="token" id="copy-token" hidden>Copy token</button>
        </div>
        <p id="status" role="status"></p>
      </div>
      <div class="card">
        <h2>Lost a device?</h2>
        <p>Signs out every device using this account. Each one needs the new token pasted in; sync data is kept.</p>
        <button class="danger" id="revoke">Sign out all devices</button>
      </div>
    </main>
    <script>
    const status = document.getElementById('status');
    const tokenBox = document.getElementById('token');
    const copyToken = document.getElementById('copy-token');

    async function issue(path) {
      const res = await fetch(path, { method: 'POST', headers: { '{{CSRF_HEADER}}': '1' } });
      if (!res.ok) throw new Error(res.status + ' ' + (await res.text()));
      return res.json();
    }

    function show(result, message) {
      tokenBox.value = result.token;
      tokenBox.hidden = false;
      copyToken.hidden = false;
      const expires = new Date(result.expiresAt).toLocaleDateString();
      status.textContent = message + ' It is valid until ' + expires + '.';
    }

    async function run(button, path, message) {
      button.disabled = true;
      status.textContent = '';
      try { show(await issue(path), message); }
      catch (e) { status.textContent = 'Failed: ' + e.message; }
      finally { button.disabled = false; }
    }

    document.getElementById('get').addEventListener('click', (e) =>
      run(e.currentTarget, '/token', 'Token ready.'));

    document.getElementById('revoke').addEventListener('click', (e) => {
      if (!confirm('Sign out every device on this account?')) return;
      run(e.currentTarget, '/revoke', 'Every older token is revoked (within 30 seconds). Paste this one into each device.');
    });

    for (const button of document.querySelectorAll('[data-copy]')) {
      button.addEventListener('click', async () => {
        const target = document.getElementById(button.dataset.copy);
        try { await navigator.clipboard.writeText(target.value); }
        catch { target.select(); document.execCommand('copy'); }
        const label = button.textContent;
        button.textContent = 'Copied';
        setTimeout(() => { button.textContent = label; }, 1500);
      });
    }
    </script>
    </body>
    </html>
    """;
}
