<?php
// System config for cloud.<ROOT_DOMAIN>, copied into config/ by
// 10-configure.sh on every start. Nextcloud reads config.php first and then
// every config/*.config.php, later files overriding earlier ones, so the values
// here win over anything the installer or the admin UI wrote into config.php.
//
// NC_HOST is set in ../helmrelease.yaml from ROOT_DOMAIN (Flux substitution is
// off for this file, see ../kustomization.yaml).
$CONFIG = [
  // One hostname, on purpose -- no tailnet alias (see ../ks.yaml).
  // `localhost` is always trusted, which is what the probes and the exporter
  // sidecar use.
  'trusted_domains' => [getenv('NC_HOST')],
  'overwrite.cli.url' => 'https://' . getenv('NC_HOST'),
  // TLS terminates at Traefik; without this, generated URLs (including the
  // Login Flow v2 hand-off the desktop and mobile clients use) come out http://.
  'overwriteprotocol' => 'https',
  'htaccess.RewriteBase' => '/',

  // The cluster pod CIDR (talos/talconfig.yaml clusterPodNets): Traefik's pod
  // IPs. Required for Nextcloud to believe X-Forwarded-For, which brute-force
  // protection and the admin "last seen from" rely on.
  'trusted_proxies' => ['10.206.0.0/16'],
  'forwarded_for_headers' => ['HTTP_X_FORWARDED_FOR'],

  // Every hostname the server itself fetches -- authentik's OIDC discovery
  // document, Collabora's /hosting/discovery -- resolves to a LAN or cluster
  // address, and Nextcloud's HTTP client refuses those by default with a
  // LocalServerException. For user_oidc that surfaces as a 404 "Could not
  // reach the OpenID Connect provider" on /apps/user_oidc/login/1 (2026-09-27).
  // There is no per-host allowlist, so this is all or nothing.
  'allow_local_remote_servers' => true,

  'default_phone_region' => 'US',
  // Hour in UTC: 06:00 UTC is 02:00 America/New_York. Heavy background jobs
  // wait for this window.
  'maintenance_window_start' => 6,

  // To stderr via Apache's error log, then to Loki.
  'log_type' => 'errorlog',
  'loglevel' => 2,

  // Previews on demand only; photos belong to Immich, so there is no
  // previewgenerator and no Imaginary.
  'preview_max_x' => 2048,
  'preview_max_y' => 2048,
  'preview_max_filesize_image' => 50,

  // An OIDC login must never adopt a same-named LOCAL account -- that is how
  // the break-glass `ncadmin` would be taken over by an authentik user who
  // happened to be called ncadmin.
  'user_oidc' => [
    'soft_auto_provision' => false,
  ],
];
