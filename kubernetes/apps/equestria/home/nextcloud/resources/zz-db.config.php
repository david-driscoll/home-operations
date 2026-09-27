<?php
// Database connection, read from the environment on EVERY request.
//
// The installer copies POSTGRES_PASSWORD into config.php exactly once, and
// components/postgres rotates the password through an OpenBao static role every
// 30 days. Without this file, Nextcloud keeps using the install-time password
// and fails the first time it rotates -- the FreshRSS outage of 2026-08-27
// (see freshrss/ks.yaml), which sat 1/1 Ready serving 500s for hours.
//
// Nextcloud merges config/*.config.php after config.php, so these values
// override whatever the installer wrote. The env comes from the `nextcloud-db`
// Secret; Reloader restarts the pod when a rotation changes it.
if (getenv('POSTGRES_PASSWORD') !== false) {
  $CONFIG = [
    'dbtype' => 'pgsql',
    'dbhost' => getenv('POSTGRES_HOST'),
    'dbname' => getenv('POSTGRES_DB'),
    'dbuser' => getenv('POSTGRES_USER'),
    'dbpassword' => getenv('POSTGRES_PASSWORD'),
  ];
}
