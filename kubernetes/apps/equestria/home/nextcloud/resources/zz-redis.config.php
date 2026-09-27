<?php
// Caching and file locking.
//
// The shared, passwordless Valkey in `database`, isolated by database index
// only: 13 is Nextcloud's (0, 6, 9, 10, 11 and 12 are taken -- see
// kubernetes/apps/database/valkey). REDIS_HOST is deliberately NOT set on the
// pod, so the image's own redis.config.php (which cannot set dbindex) stays
// inert and this file is the only Redis config.
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
    'dbindex' => 13,
    'timeout' => 1.5,
  ],
];
