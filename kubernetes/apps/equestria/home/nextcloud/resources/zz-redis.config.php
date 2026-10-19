<?php
// Caching and file locking.
//
// The shared, passwordless Valkey in `database`, isolated by database index
// only: 4 is Nextcloud's, per the allocation table in
// kubernetes/apps/database/valkey/helmrelease.yaml. REDIS_HOST is deliberately
// NOT set on the pod, so the image's own redis.config.php (which cannot set
// dbindex) stays inert and this file is the only Redis config.
//
// Was 13 until 2026-10-18, which Sure had also been using for its Sidekiq
// queues since 2026-10-05: an index set here, in PHP, is invisible to a grep
// for `:6379/13`. Nextcloud is the one that moved because everything it keeps
// in Valkey is disposable -- a cache and short-lived file locks -- whereas
// Sure's index holds Sidekiq's queues and job schedules.
//
// A Valkey restart briefly fails file locking and bounces in-flight uploads;
// the same is true of every other Valkey consumer.
$CONFIG = [
  'memcache.local' => '\\OC\\Memcache\\APCu',
  'memcache.distributed' => '\\OC\\Memcache\\Redis',
  'memcache.locking' => '\\OC\\Memcache\\Redis',
  'redis' => [
    'host' => 'valkey.database.svc.cluster.local',
    'port' => 6379,
    'dbindex' => 4,
    'timeout' => 1.5,
  ],
];
