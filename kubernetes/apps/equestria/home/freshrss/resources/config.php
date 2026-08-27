<?php
// FreshRSS system configuration -- rendered by external-secrets, NOT by FreshRSS.
//
// Why this file is in git at all. FreshRSS reads DB_PASSWORD (and every other
// env var) exactly once: at first install, when cli/do-install.php writes
// data/config.php onto the PVC. After that the PVC copy is authoritative and the
// environment is ignored -- the image entrypoint only calls do-install.php when
// FRESHRSS_INSTALL is set, and that exits 3 ("already installed, no change") the
// moment config.php exists. So the 30-day postgres rotation reached the Secret,
// reached the pod's env, and stopped there: on 2026-08-27 FreshRSS spent hours
// serving HTTP 500s with "password authentication failed for user freshrss"
// while the pod sat 1/1 Ready with both probes green.
//
// How it works now. This file is slurped whole by the kustomize
// configMapGenerator in ../kustomization.yaml, rendered as a Go text/template by
// the ExternalSecret in ../externalsecret.yaml (templateFrom, templateAs:
// Values), and the rendered result lands in the freshrss-env Secret under the
// key config.php. The freshrss-sync-config initContainer copies it onto the PVC
// on every pod start, and reloader restarts the pod whenever the Secret changes
// -- so a credential rotation now actually reaches the application.
//
// Editing rules, in order of how badly they bite:
//
//  1. Two renderers run over this file before FreshRSS ever sees it, and neither
//     kustomize build nor helm template nor flate exercises them. Flux postBuild
//     envsubst substitutes any shell-style variable reference ANYWHERE in the
//     file, comments included, and undefined names expand to empty with no
//     error. Keep this file free of them -- it currently contains none, which is
//     load-bearing, not incidental. Go template actions likewise: the only two
//     are the salt and the database password below. Never put one in a comment.
//     scripts/eso-values-lint guards exactly this; run "mise run eso-values-lint".
//
//  2. This file is the source of truth for FreshRSS's SYSTEM settings, so the
//     admin "System configuration" page is now advisory. FreshRSS will still
//     write its changes to the PVC (they are not blocked -- the file is a real
//     writable file, not a read-only mount), but the initContainer overwrites
//     them on the next restart. Change settings here, not in the UI.
//
//  3. The salt seasons FreshRSS's password and API-password hashing. It is NOT
//     regenerable: changing it invalidates every stored hash. It lives in
//     OpenBao at clusters/equestria/apps/freshrss/salt, field "password".
//
//  4. User-level settings are NOT here -- those live in data/users/ on the PVC
//     and are still owned by FreshRSS. This file is system scope only.
//
return array (
  'environment' => 'production',
  'salt' => '{{ .salt_password }}',
  'base_url' => 'https://freshrss.driscoll.tech',
  'auto_update_url' => 'https://update.freshrss.org',
  'language' => 'en',
  'title' => 'FreshRSS',
  'meta_description' => '',
  'logo_html' => '',
  'default_user' => 'david',
  'force_email_validation' => false,
  'allow_anonymous' => false,
  'allow_anonymous_refresh' => false,
  'auth_type' => 'http_auth',
  'reauth_required' => true,
  'reauth_time' => 1200,
  'http_auth_auto_register' => true,
  'http_auth_auto_register_email_field' => '',
  'api_enabled' => true,
  'suppress_csp_warning' => false,
  'csp.frame-ancestors' => '\'none\'',
  'simplepie_syslog_enabled' => true,
  'pubsubhubbub_enabled' => false,
  'allow_robots' => false,
  'allow_referrer' => false,
  'nb_parallel_refresh' => 10,
  'limits' => 
  array (
    'cookie_duration' => 7776000,
    'cache_duration' => 800,
    'cache_duration_min' => 60,
    'cache_duration_max' => 86400,
    'retry_after_default' => 1500,
    'retry_after_max' => 172800,
    'timeout' => 20,
    'max_inactivity' => 9223372036854775807,
    'max_feeds' => 131072,
    'max_categories' => 16384,
    'max_registrations' => 1,
    'max_favicon_upload_size' => 1048576,
  ),
  'curl_options' => 
  array (
  ),
  'db' => 
  array (
    'type' => 'pgsql',
    'host' => 'postgres-rw.database.svc.cluster.local',
    'user' => 'freshrss',
    'password' => '{{ .postgres_password }}',
    'base' => 'freshrss',
    'prefix' => '',
    'connection_uri_params' => '',
    'pdo_options' => 
    array (
    ),
  ),
  'mailer' => 'mail',
  'smtp' => 
  array (
    'hostname' => '',
    'host' => 'localhost',
    'port' => 25,
    'auth' => false,
    'auth_type' => '',
    'username' => '',
    'password' => '',
    'secure' => '',
    'from' => 'root@localhost',
  ),
  'extensions_enabled' => 
  array (
  ),
  'extensions' => 
  array (
  ),
  'disable_update' => true,
  'trusted_sources' => 
  array (
    0 => '127.0.0.0/8',
    1 => '::1/128',
  ),
);