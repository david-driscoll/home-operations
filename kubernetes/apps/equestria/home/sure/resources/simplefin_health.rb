# frozen_string_literal: true

# SimpleFIN account health check. Run daily by the `sure-simplefin-health`
# CronJob in ../simplefin-health.yaml as `bin/rails runner`, on Sure's own
# image, because Sure stores each SimpleFIN access URL ENCRYPTED (Active Record
# encryption) -- only a process holding Sure's keys can read it.
#
# It writes NOTHING. It reads Sure's database, asks SimpleFIN for balances, and
# prints one JSON line per (account, check) to stdout:
#
#   {"event":"simplefin_health","check":"stale","account":"...","ok":0,...}
#
# Alerting is entirely in ../loki-rules.yaml, which takes the LATEST `ok` per
# (account, check) -- so an alert holds until a later run reports that account
# healthy, and a run that cannot reach SimpleFIN changes nothing.
#
# Checks, per account:
#   connection  SimpleFIN's errlist names the account's connection (or the
#               account itself) -- e.g. con.auth "Auth required".
#   stale       balance-date older than SIMPLEFIN_STALE_DAYS.
#   missing     linked to an active Sure account, but SimpleFIN no longer
#               returns it (a closed or re-added account; a duplicate left
#               behind).
#
# Plus one `"check":"run"` line per run: ok=1 when every item was checked,
# ok=0 (with the reason) when one could not be.

require "net/http"
require "json"

EVENT = "simplefin_health"
STALE_DAYS = Integer(ENV.fetch("SIMPLEFIN_STALE_DAYS", "3"))
IGNORED_ACCOUNTS = ENV.fetch("SIMPLEFIN_HEALTH_IGNORE", "").lines.map(&:strip).reject(&:empty?).to_set

# SimpleFIN Bridge is slow when banks are: /accounts has taken 80s+ to answer,
# and when it gives up it says 307 "Response not ready yet" or Cloudflare says
# 524. Both mean "ask again later", so they are retried with a pause between.
MAX_ATTEMPTS = Integer(ENV.fetch("SIMPLEFIN_MAX_ATTEMPTS", "5"))
RETRY_PAUSE_SECONDS = Integer(ENV.fetch("SIMPLEFIN_RETRY_PAUSE_SECONDS", "120"))
READ_TIMEOUT_SECONDS = 180

$stdout.sync = true

def emit(check:, ok:, **fields)
  puts JSON.generate({ event: EVENT, check: check, ok: ok ? 1 : 0 }.merge(fields))
end

def fetch_balances(access_url)
  uri = URI(access_url)
  path = "#{uri.path}/accounts?#{URI.encode_www_form('version' => '2', 'balances-only' => '1')}"
  last_failure = nil

  MAX_ATTEMPTS.times do |attempt|
    sleep RETRY_PAUSE_SECONDS if attempt.positive?
    begin
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == "https"
      http.open_timeout = 15
      http.read_timeout = READ_TIMEOUT_SECONDS
      request = Net::HTTP::Get.new(path)
      request.basic_auth(URI.decode_www_form_component(uri.user), URI.decode_www_form_component(uri.password))
      response = http.request(request)

      return JSON.parse(response.body) if response.code == "200"

      # 402/403 will not fix themselves on a retry: the access URL is revoked
      # or the subscription lapsed.
      raise "SimpleFIN answered #{response.code}: access revoked or unpaid" if %w[402 403].include?(response.code)

      last_failure = "HTTP #{response.code}"
    rescue Net::OpenTimeout, Net::ReadTimeout, SocketError, SystemCallError, OpenSSL::SSL::SSLError => e
      last_failure = e.class.name
    end
    warn "simplefin_health: attempt #{attempt + 1}/#{MAX_ATTEMPTS} failed (#{last_failure})"
  end

  raise "SimpleFIN did not answer after #{MAX_ATTEMPTS} attempts (last: #{last_failure})"
end

# SimpleFIN account ids (ACT-...) that are linked to an ACTIVE Sure account,
# either through account_providers or the legacy accounts.simplefin_account_id.
def linked_simplefin_accounts(item)
  item.simplefin_accounts.select do |simplefin_account|
    account = simplefin_account.linked_account || simplefin_account.account
    account && account.status == "active"
  end
end

def check_item(item, now)
  body = fetch_balances(item.access_url)
  errors = Array(body["errlist"])
  connections = Array(body["connections"]).to_h { |c| [c["conn_id"], c["name"] || c["org_name"]] }
  returned_ids = Set.new

  Array(body["accounts"]).each do |account|
    returned_ids << account["id"]
    next if IGNORED_ACCOUNTS.include?(account["id"])

    name = account["name"].to_s

    institution = connections[account["conn_id"]] || account.dig("org", "name") || "unknown"
    labels = { account: name, account_id: account["id"], institution: institution }

    account_errors = errors.select do |e|
      (e["conn_id"] && e["conn_id"] == account["conn_id"]) || (e["account_id"] && e["account_id"] == account["id"])
    end
    emit(check: "connection", ok: account_errors.empty?, **labels,
         detail: account_errors.map { |e| "#{e['code']}: #{e['msg']}" }.join("; "))

    balance_date = Time.at(account["balance-date"].to_i)
    age_days = ((now - balance_date) / 86_400).round(1)
    emit(check: "stale", ok: age_days <= STALE_DAYS, **labels,
         detail: "balance-date #{balance_date.iso8601} (#{age_days} days old, limit #{STALE_DAYS})")

    emit(check: "missing", ok: true, **labels, detail: "")
  end

  linked_simplefin_accounts(item).each do |simplefin_account|
    next if returned_ids.include?(simplefin_account.account_id)
    next if IGNORED_ACCOUNTS.include?(simplefin_account.account_id)

    labels = { account: simplefin_account.name.to_s, account_id: simplefin_account.account_id,
               institution: simplefin_account.org_data&.dig("name") || "unknown" }
    # Reported OK so an earlier connection/stale failure for this account does
    # not stay firing alongside the `missing` alert that supersedes it.
    emit(check: "connection", ok: true, **labels, detail: "superseded by missing")
    emit(check: "stale", ok: true, **labels, detail: "superseded by missing")
    emit(check: "missing", ok: false, **labels,
         detail: "linked in Sure but not returned by SimpleFIN")
  end

  # Errors that name neither a known connection nor an account (bridge-wide
  # notices) are not per-account, but are worth seeing in the log.
  errors.reject { |e| e["conn_id"] || e["account_id"] }.each do |e|
    warn "simplefin_health: item-level SimpleFIN error #{e['code']}: #{e['msg']}"
  end
end

now = Time.now
failures = []

SimplefinItem.where(scheduled_for_deletion: false).find_each do |item|
  check_item(item, now)
rescue StandardError => e
  failures << "#{item.name || item.id}: #{e.message}"
end

emit(check: "run", ok: failures.empty?, account: "", account_id: "", institution: "",
     detail: failures.empty? ? "all items checked" : failures.join("; "))
