-- fnox provider: one value out of a SOPS file in this repo.
--
-- fnox has no built-in sops provider, so this wraps the pinned `sops` CLI. sops
-- reads SOPS_AGE_KEY_FILE itself (set in .config/mise.toml's [env]), so unlike
-- vals there is no SOPS_AGE_KEY bridging to do here.
--
-- A reference is `<repo-relative file>#<key path>`, the same shape as the
-- `ref+sops://` values it replaces:
--
--   BAO_ROLE_ID = { provider = "sops", value = ".config/bao-approle.sops.yaml#role_id" }
--
-- The key path is `/`-separated for nested keys, with an optional leading `/`
-- (vals' `#/role_id` form works too). Read-only: write a sops file with `sops`.
local cmd = require("fnox.cmd")
local json = require("fnox.json")

-- The plugin lives in <repo>/.config/fnox/, so the repo root is two up. Paths
-- in references resolve against it, so a reference means the same file from
-- any directory fnox runs in.
local function repo_root(ctx)
  return ctx.plugin_dir .. "/../.."
end

local function split_ref(ref)
  local file, key = ref:match("^([^#]+)#/?(.+)$")
  if not file then
    error("sops reference must be `<file>#<key>`, got `" .. ref .. "`")
  end
  return file, key
end

local function decrypt(ctx, file)
  local result = cmd.run({ "sops", "--decrypt", "--output-type", "json", repo_root(ctx) .. "/" .. file })
  if not result.ok then
    error("sops could not decrypt " .. file .. ": " .. result.stderr)
  end
  return json.decode(result.stdout)
end

local function lookup(doc, key)
  local node = doc
  for part in key:gmatch("[^/]+") do
    if type(node) ~= "table" then return nil end
    node = node[part]
  end
  if type(node) == "table" then return json.encode(node) end
  return node
end

return {
  get = function(ctx, ref)
    local file, key = split_ref(ref)
    return lookup(decrypt(ctx, file), key)
  end,

  -- Decrypt each file once, however many keys are read from it.
  get_batch = function(ctx, refs)
    local docs, values = {}, {}
    for _, ref in ipairs(refs) do
      local file, key = split_ref(ref)
      docs[file] = docs[file] or decrypt(ctx, file)
      values[ref] = lookup(docs[file], key)
    end
    return values
  end,

  test = function(ctx)
    cmd.exec({ "sops", "--version" })
  end,
}
