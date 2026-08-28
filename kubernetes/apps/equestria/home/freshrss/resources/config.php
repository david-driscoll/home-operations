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
//     kustomize build nor helm template nor flate exercises them.
//
//     Flux postBuild envsubst runs FIRST, over the whole built output, and
//     substitutes any shell-style variable reference ANYWHERE in the file --
//     comments included. base_url below uses that deliberately, and it is the
//     ONLY one; an undefined name would expand to empty with no error and no log
//     line, so do not add more without checking the name is actually in this
//     Kustomization's substitution scope (ks.yaml postBuild plus the
//     cluster-secrets substituteFrom). Note flate renders it empty offline, so
//     the validated ConfigMap reads "https://freshrss." -- that is expected.
//
//     external-secrets' Go text/template runs SECOND, after envsubst, so the two
//     actions below already see a substituted base_url. They are the only two:
//     the salt and the database password. Never put either syntax in a comment.
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
  'base_url' => 'https://freshrss.${ROOT_DOMAIN}',
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
  // Loopback ONLY, on purpose -- do not widen this to the cluster/service CIDRs.
  //
  // The name reads like "trusted reverse proxies", but FreshRSS_http_Util::
  // checkTrustedIP() has exactly one functional caller: httpAuthUser(), where it
  // gates HTTP_REMOTE_USER and HTTP_X_WEBAUTH_USER. It has nothing to do with
  // X-Forwarded-For, client-IP logging, or rate limiting. Widening it means
  // "these sources may assert who the user is by sending a header".
  //
  // The OIDC flow does not need it: mod_auth_openidc runs inside this same
  // Apache and sets REMOTE_USER, which httpAuthUser() returns BEFORE reaching the
  // trust gate. Login works today with loopback only, which is the proof.
  //
  // Widening it to 10.206.0.0/16 (pods) and 10.196.0.0/16 (services) was
  // considered on 2026-08-27 and rejected: it would not have matched any real
  // traffic, because everything reaching this pod is SNAT'd to the LAN --
  // measured over 30 minutes, 10.10.206.10 (kubelet probe), 10.10.10.9 (Gatus)
  // and 10.10.48.116 (browser via Traefik), with ZERO sources in either CIDR.
  // It would, however, have been live for direct pod-to-pod traffic to the
  // ClusterIP, which does preserve a 10.206.x.x source -- so any pod in the
  // cluster could have sent "X-WebAuth-User: david" and been authenticated.
  // No benefit on the real path, a real bypass on the unintended one.
  'trusted_sources' => 
  array (
    0 => '127.0.0.0/8',
    1 => '::1/128',
  ),
);
