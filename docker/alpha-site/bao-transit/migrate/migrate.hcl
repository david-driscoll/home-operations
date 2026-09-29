// One-time storage migration for bao-transit: `storage "file"` -> integrated
// raft. Run by the bao-transit-migrate service (compose.yaml) through
// migrate.sh, NOT loaded by the server -- which is why it lives outside
// ./config: the image's entrypoint adds `-config=/openbao/config` (the whole
// directory), so anything in there becomes server configuration.
//
// `bao operator migrate` copies the raw, still-encrypted storage entries; it
// needs no unseal key and never decrypts anything. The source is only read
// (plus the migration lock it takes and releases), so /openbao/data stays
// intact as the rollback.
storage_source "file" {
  path = "/openbao/data"
}

storage_destination "raft" {
  path    = "/openbao/raft"
  node_id = "bao-transit"
}

cluster_addr = "http://127.0.0.1:8201"
