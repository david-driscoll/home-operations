# op-to-bao

Migrates 1Password (`Eris` vault) items into OpenBao KV v2.

```sh
npx tsx scripts/op-to-bao          --plan            # -> mapping.yaml, for review
$EDITOR scripts/op-to-bao/mapping.yaml               # <- the important step
npx tsx scripts/op-to-bao          --apply --dry-run # show what would change
npx tsx scripts/op-to-bao          --apply
npx tsx scripts/op-to-bao          --verify          # drift check, safe to re-run

npx tsx --test scripts/op-to-bao/mapping.test.ts     # 23 tests, no network
```

Environment: `CONNECT_HOST` / `CONNECT_TOKEN` for 1Password (already in
`.config/mise.toml`), `BAO_ADDR` / `BAO_TOKEN` for OpenBao.

## Why plan and apply are separate

The path scheme cannot be derived from item titles alone with enough confidence to write
blind. `Cluster: Alpha Site`, `Cloudflare (driscoll.tech)`, and four items addressed by
UUID rather than title all slug into something a human needs to look at. So `--plan`
proposes, a human corrects, and `--apply` reads the corrected file — never the classifier.

`mapping.yaml` is committed. It is the record of where every secret went.

Entries carry `review: true` when the classifier is guessing. Set `skip: true` to exclude
an item — the common case is cross-stack **inventory** (`backup-plan`, `tailscale-export`,
`cluster-definition` tags), which moves to Pulumi stack outputs consumed via
`StackReference` rather than into OpenBao. Those are pre-marked `skip`.

**Field values never appear in `mapping.yaml`** — only labels.

## Layout it produces

```
secrets/shared/<slug>                              provider creds, app secrets
secrets/clusters/<cluster>/apps/<app>/oidc         from <cluster>-<app>-oidc-credentials
secrets/clusters/<cluster>/apps/<app>/postgres     from <cluster>-<app>-postgres
secrets/hosts/dockge/<slug>                        from tag:dockge
secrets/hosts/pbs/<slug>                           from tag:pbs
docs/<slug>                                        SecureNotes with no concealed field
```

Tag queries become path prefixes plus `LIST`, which is what replaces `findItemsByTag` —
KV v2 has no tag index.

## Shape of a converted item

Root fields become top-level keys; sections become nested objects. 1Password's `"add more"`
pseudo-section is already hoisted to root by `OPClient.mapItem`, so it never reaches here.

Files carry bytes, so they land under a `files` key as
`{filename, content_b64, sha256}` — in **data**, not metadata, because `vals` cannot read
metadata and a consumer needs the encoding marker.

`custom_metadata` carries provenance only: `source_title`, `source_uuid`, `source_tags`,
`concealed_fields`, `migrated_at`, `contains_secrets`. Never values. Three reasons, all
properties of `custom_metadata` itself rather than of any tool:

1. It is key-scoped, not version-scoped — rolling a secret back does not roll its metadata
   back.
2. OpenBao caps it at 64 keys / 128-char keys / 512-char values. Long lists are truncated
   rather than failing the write.
3. `metadata/` and `data/` are separate ACL paths, so anything stored there needs a second
   grant on every consumer.

## Safety properties

- **Path collisions are a hard error** in `--plan`, not a warning. Two items mapping to one
  path would silently overwrite one secret with another.
- **`--apply` is idempotent.** Items whose data already matches are skipped, and writes use
  KV v2 CAS (`cas: 0` to create, `cas: <version>` to update) so a concurrent writer errors
  instead of being clobbered.
- **`--verify` never prints values** — only which keys are missing, extra, or differing.
  Its output is safe to paste into an issue.
- `--apply` is resumable: a failure on one item is reported and the run continues.

## Note on `LIST`

`BaoClient.list` uses `GET ...?list=true` rather than the `LIST` verb. Both work against
OpenBao — `http/logical_test.go` covers the query form explicitly — but `LIST` is not a
registered HTTP method, Node's own parser rejects it (`http.METHODS` has no `"LIST"`), and
intermediate proxies frequently do too.
