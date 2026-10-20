-- fnox provider: OpenBao KV v2, authenticated with the mise AppRole.
--
-- fnox's built-in `vault` provider shells out to the `vault` CLI and takes only
-- a token. This talks to the HTTP API directly, the same two calls
-- components/bao.ts makes: `auth/approle/login`, then `<mount>/data/<path>`.
-- So nothing beyond fnox is needed.
--
-- A reference is the `ref+openbao://` value it replaces, minus the scheme:
--
--   AWS_ACCESS_KEY_ID = { provider = "openbao", value = "secrets/apps/pulumi/state-s3#username" }
--
-- The first path segment is the KV v2 mount. The field after `#` takes an
-- optional leading `/` (vals' `#/username` form). With no field, the whole
-- secret comes back as JSON, for a secret's `json_path`.
--
-- Credentials, in the order components/bao.ts tries them:
--   1. BAO_TOKEN (or VAULT_TOKEN) from the environment: the break-glass path.
--      `eval "$(bootstrap/openbao/pulumi-env.sh)"` exports VAULT_TOKEN, so it
--      works here as-is. For Pulumi itself also `export BAO_TOKEN=$VAULT_TOKEN`:
--      fnox injects the sops BAO_ROLE_ID/BAO_SECRET_ID over the pair that
--      script exports, and components/bao.ts prefers BAO_TOKEN to either.
--   2. options.role_id / options.secret_id: the AppRole, which fnox.toml points
--      at the BAO_ROLE_ID / BAO_SECRET_ID secrets (sops), so fnox resolves them
--      first. This ordering is the reason vals-run needed two passes.
local fnox = require("fnox")
local http = require("fnox.http")
local json = require("fnox.json")

local function address(ctx)
  local addr = ctx.options.address
  if not addr or addr == "" then
    error("OpenBao address is not set. BAO_ADDR comes from .config/mise.toml; run fnox under mise (`mise x -- fnox ...`)")
  end
  -- BAO_ADDR renders as `https://bao.equestria.` when ROOT_DOMAIN is empty,
  -- i.e. when mise could not decrypt .config/domains.sops.yaml.
  if addr:match("%.$") then
    error("BAO_ADDR is `" .. addr .. "`: ROOT_DOMAIN is empty, so the age key is missing (SOPS_AGE_KEY_FILE)")
  end
  return (addr:gsub("/+$", ""))
end

local function login(ctx, addr)
  for _, name in ipairs({ "BAO_TOKEN", "VAULT_TOKEN" }) do
    local token = os.getenv(name)
    if token and token ~= "" and not token:match("^ref%+") then
      return token
    end
  end
  local role_id, secret_id = ctx.options.role_id, ctx.options.secret_id
  if not role_id or role_id == "" or not secret_id or secret_id == "" then
    fnox.auth_error("no OpenBao credentials: set BAO_TOKEN, or make BAO_ROLE_ID/BAO_SECRET_ID resolve (.config/bao-approle.sops.yaml)")
  end
  local resp = http.post(addr .. "/v1/auth/approle/login", json.encode({ role_id = role_id, secret_id = secret_id }), {
    headers = { ["Content-Type"] = "application/json" },
  })
  if not resp.ok then
    fnox.auth_error("AppRole login to " .. addr .. " failed: " .. resp.status .. " " .. resp.body)
  end
  local body = json.decode(resp.body)
  local client_token = body and body.auth and body.auth.client_token
  if not client_token then
    error("AppRole login returned no client_token")
  end
  return client_token
end

local function split_ref(ref)
  local path, field = ref:match("^([^#]+)#?/?(.*)$")
  local mount, rest = (path or ""):match("^([^/]+)/(.+)$")
  if not mount then
    error("openbao reference must be `<mount>/<path>#<field>`, got `" .. ref .. "`")
  end
  return mount, rest, field
end

-- Returns the secret's data table, or nil when it does not exist.
local function read(addr, token, mount, path)
  local resp = http.get(addr .. "/v1/" .. mount .. "/data/" .. path, {
    headers = { ["X-Vault-Token"] = token },
  })
  if resp.status == 404 then return nil end
  if resp.status == 403 then
    error("permission denied reading " .. mount .. "/" .. path .. " (the AppRole's policy does not cover it)")
  end
  if not resp.ok then
    error("reading " .. mount .. "/" .. path .. " failed: " .. resp.status .. " " .. resp.body)
  end
  local body = json.decode(resp.body)
  return body and body.data and body.data.data
end

local function pick(data, field)
  if data == nil then return nil end
  if field == "" then return json.encode(data) end
  local value = data[field]
  if type(value) == "table" then return json.encode(value) end
  return value
end

return {
  get = function(ctx, ref)
    local addr = address(ctx)
    local mount, path, field = split_ref(ref)
    return pick(read(addr, login(ctx, addr), mount, path), field)
  end,

  -- One login, and one read per distinct path, for the whole batch.
  get_batch = function(ctx, refs)
    local addr = address(ctx)
    local token = login(ctx, addr)
    local secrets, values = {}, {}
    for _, ref in ipairs(refs) do
      local mount, path, field = split_ref(ref)
      local key = mount .. "/" .. path
      if secrets[key] == nil then
        secrets[key] = read(addr, token, mount, path) or false
      end
      values[ref] = pick(secrets[key] or nil, field)
    end
    return values
  end,

  test = function(ctx)
    local addr = address(ctx)
    local resp = http.get(addr .. "/v1/auth/token/lookup-self", {
      headers = { ["X-Vault-Token"] = login(ctx, addr) },
    })
    if not resp.ok then
      error("token lookup failed: " .. resp.status .. " " .. resp.body)
    end
  end,
}
