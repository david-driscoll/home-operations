# Main container of ../static-dns-check.yaml (ghcr.io/jqlang/jq, no shell).
# Run as: jq -n -r -f check.jq --slurpfile dns static-dns.json --slurpfile log commit-errors.json
#
# Fails (exit 1) when either:
#   - a non-TXT static-DNS name is stored more than once, compared
#     case-insensitively. The gateway renders static DNS into its dnsmasq
#     config and one duplicate fails the whole apply, so every later gateway
#     commit (DNS, DHCP, networks) fails too. TXT is excluded because
#     external-dns ownership records legitimately share names.
#   - the gateway logged DEVICE_COMMIT_ERROR inside the fetch window. That
#     catches the same breakage when the cause is something other than a
#     duplicate.

($dns[0] // []) as $records
| ($records | map(select(.record_type != "TXT"))
  | group_by(.key | ascii_downcase)
  | map(select(length > 1))) as $duplicates
| ($log[0].data // []) as $errors
| [
    "static-dns: \($records | length) records, \($duplicates | length) duplicated non-TXT names",
    ($duplicates[] | "DUPLICATE \(.[0].key | ascii_downcase) x\(length): \(map("\(.record_type) \(.value) (\(._id))") | join(", "))"),
    "DEVICE_COMMIT_ERROR events in window: \($errors | length)",
    ($errors[] | "COMMIT ERROR \(.timestamp / 1000 | floor | todate): \(.title_raw) - \(.message_raw)")
  ] as $report
| if ($duplicates | length) > 0 or ($errors | length) > 0 then
    ($report + [
      if ($duplicates | length) > 0
      then "FAIL: delete the extra record(s) above in UniFi static DNS (DELETE .../static-dns/<_id>)"
      else "FAIL: no duplicate name; check the AUDIT events in the same system log for what changed just before the first error"
      end
    ])
    | join("\n") + "\n" | halt_error(1)
  else
    ($report + ["OK"]) | join("\n")
  end
