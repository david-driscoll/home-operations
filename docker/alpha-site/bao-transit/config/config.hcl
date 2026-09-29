// bao-transit — the seal root for the estate.
//
// This node exists for one job: hold the transit key that auto-unseals the
// OpenBao HA cluster in equestria. It stores no application secrets, and it
// must NOT be merged with the break-glass standby — co-locating the ciphertext
// with the key that decrypts it defeats the point of transit unseal.
//
// Chain: age.key -> static unseal key -> bao-transit -> equestria OpenBao.

ui = true

listener "tcp" {
  address     = "0.0.0.0:8200"
  // Reachable only over Tailscale: compose binds the published port to the
  // tailnet address rather than 0.0.0.0. Terminating TLS here as well is worth
  // doing once this is past first-run.
  tls_disable = true
}

// Integrated raft, single node. This was `storage "file"`, which OpenBao
// 2.7.0 removed -- the bump to 2.7.0 (#2008) left this node crash-looping on
// "unknown storage type file" from 2026-09-24 to 09-28. Raft keeps the
// property the file backend was chosen for: it lives entirely on this host's
// disk and needs nothing else in the estate to be up to start.
//
// The move happened once, via a one-shot bao-transit-migrate service (#2181,
// `bao operator migrate` on 2.6.x), removed again once raft was confirmed live.
// The old file storage is still at /opt/stacks-data/bao-transit/data, untouched,
// but only a 2.6.x node can read it: going back means reverting to #2181's
// image and config (anything written since, such as seal-token renewals,
// exists only in raft).
storage "raft" {
  path    = "/openbao/raft"
  node_id = "bao-transit"
}

// Raft requires both. Single node, nothing to redirect to or replicate with,
// so loopback is correct; 8201 is never published.
api_addr     = "http://127.0.0.1:8200"
cluster_addr = "http://127.0.0.1:8201"

// Auto-unseal from a 32-byte AES-256-GCM-96 key supplied as an environment
// variable. Confirmed against the OpenBao source docs (configuration/seal/
// static.mdx): current_key accepts a literal, or an env:// or file:// prefix,
// and the key must be exactly 32 bytes — no other algorithm is supported.
//
// current_key_id is a plain identifier, not a secret, and is NOT env-
// interpolated by OpenBao, so it stays literal here. On rotation set
// current_key to the new key and move the old one to previous_key/
// previous_key_id, then drop the previous pair on the following pass.
seal "static" {
  current_key_id = "20260807-1"
  current_key    = "env://BAO_UNSEAL_KEY"
}
