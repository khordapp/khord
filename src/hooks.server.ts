import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getDbRw } from '$lib/server/db';

// Ensure owner DIDs are always registered on startup so admins are never
// locked out after a reset or on a fresh install.
const ownerDids = (env.OWNER_DIDS ?? '').split(',').map((d) => d.trim()).filter(Boolean);
if (ownerDids.length > 0) {
	const db = getDbRw();
	if (db) {
		for (const did of ownerDids) {
			db.prepare('INSERT INTO registered_users(did) VALUES(?) ON CONFLICT(did) DO NOTHING').run(did);
		}
	}
}

// Apple App Site Association — required for Universal Links (iOS/macOS).
// Replace TEAM_ID and BUNDLE_ID with the official app values when the
// Apple Developer account is configured.
const AASA_TEAM_ID = env.APPLE_TEAM_ID ?? 'TEAMID_PLACEHOLDER';
const AASA_BUNDLE_ID = env.APPLE_BUNDLE_ID ?? 'app.khord.ios';

const aasa = JSON.stringify({
	applinks: {
		details: [
			{
				appIDs: [`${AASA_TEAM_ID}.${AASA_BUNDLE_ID}`],
				components: [
					{ '/': '/song/*' },
					{ '/': '/s/*' }
				]
			}
		]
	}
});

// Android Asset Links — required for App Links (Android).
// Replace PACKAGE_NAME and SHA256_FINGERPRINT with the official app values.
const ANDROID_PACKAGE = env.ANDROID_PACKAGE ?? 'app.khord.android';
const ANDROID_SHA256 = env.ANDROID_SHA256 ?? 'SHA256_PLACEHOLDER';

const assetlinks = JSON.stringify([
	{
		relation: ['delegate_permission/common.handle_all_urls'],
		target: {
			namespace: 'android_app',
			package_name: ANDROID_PACKAGE,
			sha256_cert_fingerprints: [ANDROID_SHA256]
		}
	}
]);

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	if (pathname === '/.well-known/apple-app-site-association') {
		return new Response(aasa, {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	if (pathname === '/.well-known/assetlinks.json') {
		return new Response(assetlinks, {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	return resolve(event);
};
