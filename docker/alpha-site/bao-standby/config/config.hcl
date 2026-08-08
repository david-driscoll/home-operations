# bao-standby — break-glass single node, restored from the nightly dump.
#
# Deliberately NOT here (env beats config, confirmed against source — see
# vault docs/openbao-migration/STATUS.md):
#   connection_url  → BAO_PG_CONNECTION_URL   (compose environment)
#   seal token      → VAULT_TRANSIT_SEAL_TOKEN (operator-supplied at start)
ui = true

listener "tcp" {
  address = "0.0.0.0:8200"
  # Only reachable over the tailnet (WireGuard) and the container network,
  # same trade-off as bao-transit.
  tls_disable = true
}

storage "postgresql" {
  # Same logical table names as equestria's config. The restored tables live
  # in the `openbao` schema and are found via the openbao role's search_path,
  # exactly as they are in CNPG.
  table      = "openbao_kv_store"
  ha_enabled = "false"
}

seal "transit" {
  # bao-transit runs on this same host; container-to-container over the
  # shared dockge_default network. Same key the equestria cluster seals with,
  # which is what makes the restored keyring usable at all.
  address    = "http://bao-transit:8200"
  key_name   = "openbao-equestria-unseal"
  mount_path = "transit/"
  disable_renewal = "false"
}
