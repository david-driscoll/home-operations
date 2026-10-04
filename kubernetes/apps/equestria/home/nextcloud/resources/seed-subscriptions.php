<?php

declare(strict_types=1);

/**
 * Gives every SSO account its own copy of the `shared` user's calendar
 * subscriptions (oc_calendarsubscriptions, principals/users/shared).
 *
 * WHY COPIES: a subscription (a webcal feed such as Holidays) is not a calendar
 * and Nextcloud cannot share one. The only way everybody sees the family's
 * feeds is for each account to hold its own row. `shared` is where they are
 * curated: add a feed there in the Calendar app and it reaches everyone.
 *
 * WHEN: the `cron` sidecar in ../helmrelease.yaml runs this after every
 * cron.php pass, so an account created by its first OIDC login has the feeds
 * within about five minutes. There is no hook for "user created" short of
 * shipping a Nextcloud app, and a loop also covers accounts that already exist
 * and feeds added to `shared` later.
 *
 * EACH FEED IS COPIED TO EACH ACCOUNT ONCE. What has been handed out is
 * recorded per user (oc_preferences, app `seed_subscriptions`), so a feed
 * somebody deletes, renames or recolours stays the way they left it. The record
 * is keyed on a hash of the feed URL, not the URL: these often carry a private
 * token and there is no reason to keep a second copy of it.
 *
 * WHY NOT AN INSERT: CalDavBackend::createSubscription dispatches
 * SubscriptionCreatedEvent, and dav's listener is what fetches the feed and
 * registers its RefreshWebcalJob. A row written straight into the table is a
 * subscription that never loads. `occ dav:create-subscription` goes through the
 * same call but can only set a name and a colour, and `dav:list-subscriptions`
 * prints a table, so this reads and writes through the backend directly.
 *
 * Only accounts on the user_oidc backend are touched: not `shared` itself and
 * not the local break-glass `ncadmin`.
 *
 * SEED_DRY_RUN=1 prints what would be copied and changes nothing.
 *
 * No braced-dollar variables anywhere in this file -- see the note at the top
 * of 10-configure.sh.
 */

use OCA\DAV\CalDAV\CalDavBackend;
use OCP\App\IAppManager;
use OCP\Config\IUserConfig;
use OCP\IConfig;
use OCP\IUser;
use OCP\IUserManager;
use OCP\Server;
use OCP\Util;
use Sabre\DAV\Xml\Property\Href;

const SOURCE_USER = 'shared';
const TARGET_BACKEND = 'user_oidc';
const CONFIG_APP = 'seed_subscriptions';
const CONFIG_KEY = 'seeded';
const SOURCE_PROPERTY = '{http://calendarserver.org/ns/}source';
// createSubscription turns these on whenever the key is PRESENT, whatever its
// value, so they are only passed along when the original has them set.
const FLAG_COLUMNS = ['striptodos', 'stripalarms', 'stripattachments'];

define('OC_CONSOLE', 1);
require_once '/var/www/html/lib/base.php';

$config = Server::get(IConfig::class);
// Mid-install, mid-upgrade or in maintenance mode: cron.php skips its own work
// in the same states, and the next pass is five minutes away.
if (!$config->getSystemValueBool('installed')
	|| $config->getSystemValueBool('maintenance')
	|| Util::needUpgrade()) {
	exit(0);
}

// Boots the apps, which is what registers dav's subscription listener.
Server::get(IAppManager::class)->loadApps();

$userManager = Server::get(IUserManager::class);
$caldav = Server::get(CalDavBackend::class);
$userConfig = Server::get(IUserConfig::class);
$dryRun = getenv('SEED_DRY_RUN') === '1';

if (!$userManager->userExists(SOURCE_USER)) {
	exit(0);
}

$wanted = [];
foreach ($caldav->getSubscriptionsForUser('principals/users/' . SOURCE_USER) as $subscription) {
	$wanted[hash('sha256', (string)$subscription['source'])] = $subscription;
}
if ($wanted === []) {
	exit(0);
}

$failed = 0;
$userManager->callForAllUsers(function (IUser $user) use ($caldav, $userConfig, $wanted, $dryRun, &$failed): void {
	$uid = $user->getUID();
	if ($uid === SOURCE_USER || $user->getBackendClassName() !== TARGET_BACKEND) {
		return;
	}

	$seeded = $userConfig->getValueArray($uid, CONFIG_APP, CONFIG_KEY);
	$missing = array_diff(array_keys($wanted), $seeded);
	if ($missing === []) {
		return;
	}

	$principal = 'principals/users/' . $uid;
	$existing = $caldav->getSubscriptionsForUser($principal);
	$sources = array_column($existing, 'source');
	$uris = array_column($existing, 'uri');

	foreach ($missing as $hash) {
		$subscription = $wanted[$hash];

		// Already subscribed to this feed by hand: record it and leave theirs.
		if (!in_array($subscription['source'], $sources, true)) {
			// Calendars and subscriptions share /calendars/<uid>/, so the uri
			// must be free in both.
			$uri = (string)$subscription['uri'];
			for ($n = 2; in_array($uri, $uris, true) || $caldav->getCalendarByUri($principal, $uri) !== null; $n++) {
				$uri = $subscription['uri'] . '-' . $n;
			}

			$properties = [SOURCE_PROPERTY => new Href((string)$subscription['source'])];
			foreach ($caldav->subscriptionPropertyMap as $xmlName => [$column]) {
				$value = $subscription[$xmlName] ?? null;
				if ($value === null || (in_array($column, FLAG_COLUMNS, true) && !$value)) {
					continue;
				}
				$properties[$xmlName] = $value;
			}

			if ($dryRun) {
				echo "seed-subscriptions: would copy '$uri' to $uid" . PHP_EOL;
				continue;
			}

			try {
				$caldav->createSubscription($principal, $uri, $properties);
			} catch (\Throwable $e) {
				// Not recorded, so the next pass tries again.
				fwrite(STDERR, "seed-subscriptions: could not copy '$uri' to $uid: " . $e->getMessage() . PHP_EOL);
				$failed++;
				continue;
			}
			$uris[] = $uri;
			echo "seed-subscriptions: copied '$uri' to $uid" . PHP_EOL;
		}

		$seeded[] = $hash;
	}

	if (!$dryRun) {
		$userConfig->setValueArray($uid, CONFIG_APP, CONFIG_KEY, array_values($seeded));
	}
});

exit($failed === 0 ? 0 : 1);
