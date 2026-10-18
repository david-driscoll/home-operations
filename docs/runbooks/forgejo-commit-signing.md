# Forgejo's commit-signing key

The in-cluster Forgejo (`kubernetes/apps/coder/forgejo`) signs the commits it
writes itself with one instance-wide SSH key, so the forge shows them as
**Verified**. This page is how that key was made, where each half of it lives,
and what it does and does not cover.

| Piece | Where |
| --- | --- |
| the settings | `[repository.signing]` in `kubernetes/apps/coder/forgejo/helmrelease.yaml` |
| the private and public key | OpenBao, `secrets/clusters/equestria/apps/forgejo/signing`, fields `private_key` and `public_key` |
| how it reaches the pod | ExternalSecret `forgejo-signing` (`externalsecret.yaml`), mounted read-only at `/etc/forgejo-signing/` in the main **and** init containers |
| the public key, as Forgejo serves it | `GET https://git.<root domain>/api/v1/signing-key.ssh` |

Nothing is registered on any Forgejo account, and nothing should be. Forgejo
checks a signature against the committer's own keys first and then against the
instance key, and an instance-key signature counts as *trusted* under the
`collaborator` trust model every repository has by default. Adding the public
key to a user as an SSH key would do worse than nothing: it would become a login
key for that account on the git SSH server, so anyone holding the Secret could
push as that person.

## What gets signed

Every policy is `always`; the comment above `[repository.signing]` says why each
conditional rule would quietly switch signing off on this forge.

| Forgejo writes | Signed? |
| --- | --- |
| a web-editor or API file edit (`CRUD_ACTIONS`) | yes |
| a wiki edit (`WIKI`) | yes |
| a new repository's first commit (`INITIAL_COMMIT`) | yes |
| a pull request merged with `merge`, `rebase-merge` or `squash` (`MERGES`) | yes -- the merge or squash commit |
| a pull request merged with `rebase` | **no** -- the replayed commits are written without `-S` |
| a pull request merged with `fast-forward-only` | nothing to sign; the original commits land as they are |

`github-mirror/home-operations` allows only `rebase` and `fast-forward-only`
(`stacks/system/forgejo-github-mirror.ts`, because the GitHub sync refuses a
commit Forgejo composes). So on that repository this signs web edits, and pull
requests stay unsigned whatever this key does. A pull request's commits are only
signed there if whoever made them signed them.

### On GitHub

Commits made on the forge reach the public GitHub repository through the sync
([forgejo-github-mirror.md](./forgejo-github-mirror.md)) with their signatures
intact, and GitHub will show those as **Unverified**: GitHub only verifies a key
registered on the account that owns the *committer* email, and the committer is
always a `<login>@noreply.forgejo.invalid` address no GitHub account can claim.
That is cosmetic; nothing on that side requires signed commits.

When the sync has to replay forge commits onto a GitHub `main` that moved
(the "diverged" case), `git rebase` rewrites them and their signatures are
dropped.

## Setting it up (once, before the pull request merges)

**Do step 2 before merging.** Forgejo reads `SIGNING_KEY` while loading its
settings and stops with `log.Fatal` if the file is missing, and the Deployment is
`strategy: Recreate` -- the running pod is deleted first, and the new one cannot
mount a Secret that does not exist yet. Merge without the key in OpenBao and the
forge is down until it is there.

### 1. Make the key

On a trusted machine, outside any checkout. ed25519 and **no passphrase**:
Forgejo runs `ssh-keygen -Y sign` non-interactively. A FIDO (`-sk`) key will not
work. Keep the root domain out of the comment, since the public half is served
by the API and copied into notes.

```bash
dir="$(mktemp -d)"
ssh-keygen -q -t ed25519 -N '' -C 'forgejo-commit-signing' -f "$dir/signing_key"
```

### 2. Write it to OpenBao

`@file` keeps each file byte-for-byte, including the trailing newline an
OpenSSH private key needs.

```bash
bao kv put secrets/clusters/equestria/apps/forgejo/signing \
  private_key=@"$dir/signing_key" \
  public_key=@"$dir/signing_key.pub"
```

Then remove the local copy. OpenBao is now the only place the private half
exists, which is what you want; its backups are the backups. (On the Mac, `rm`
is aliased to `rm -i`, hence `command`.)

```bash
command rm -rf "$dir"
```

### 3. Merge, and check

Once Flux has applied the change:

```bash
kubectl -n coder get externalsecret forgejo-signing
```

should say `SecretSynced`. After the rollout:

```bash
kubectl -n coder exec deploy/forgejo -c forgejo -- ls -l /etc/forgejo-signing/
```

lists `signing_key` and `signing_key.pub`, both readable by group `1000`.

To see a signature, edit any file in a scratch repository through the web UI.
The commit page should show *Signed by Forgejo* with the key's `SHA256:`
fingerprint and the green Verified mark.

## Checking a signature outside Forgejo

`git log --show-signature` needs to be told which key to trust for which email:

```bash
key="$(curl -fsS -H "Authorization: token $FORGEJO_TOKEN" \
  "https://git.<root domain>/api/v1/signing-key.ssh")"
printf 'forgejo@noreply.forgejo.invalid namespaces="git" %s\n' "$key" > allowed_signers
git -c gpg.ssh.allowedSignersFile=allowed_signers log --show-signature -1 <commit>
```

The email there is `SIGNING_EMAIL`. The token is only needed because the forge
sets `REQUIRE_SIGNIN_VIEW`.

## Rotating it

Forgejo knows exactly one instance key. Replace it and every commit signed with
the old one shows as unverified, because nothing can tell Forgejo the old key
was once its own. Upstream says so:
"Rotating instance keys is currently not possible." So rotate only if the
private key is compromised. To do it, repeat steps 1 and 2 (`bao kv put` replaces
both fields), wait for the ExternalSecret to refresh (up to 4 minutes), and
restart the pod (Reloader does this on its own when the Secret changes).
