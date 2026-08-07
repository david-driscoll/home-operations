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

// File storage is deliberate. The dataset is one transit key plus its metadata;
// Postgres or Raft would be more machinery guarding less state, and this node
// has to be able to start when nothing else in the estate is up.
storage "file" {
  path = "/openbao/data"
}

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
