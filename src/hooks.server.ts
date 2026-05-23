import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { SESSION_COOKIE, getSession } from '$lib/server/auth';

// Apple App Site Association — required for Universal Links (iOS/macOS).
const AASA_TEAM_ID = env.APPLE_TEAM_ID ?? 'TEAMID_PLACEHOLDER';
const AASA_BUNDLE_ID = env.APPLE_BUNDLE_ID ?? 'app.khord.ios';

const aasa = JSON.stringify({
	applinks: {
		details: [{ appIDs: [`${AASA_TEAM_ID}.${AASA_BUNDLE_ID}`], components: [{ '/': '/song/*' }, { '/': '/s/*' }] }]
	}
});

// Android Asset Links
const ANDROID_PACKAGE = env.ANDROID_PACKAGE ?? 'app.khord.android';
const ANDROID_SHA256 = env.ANDROID_SHA256 ?? 'SHA256_PLACEHOLDER';

const assetlinks = JSON.stringify([{
	relation: ['delegate_permission/common.handle_all_urls'],
	target: { namespace: 'android_app', package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: [ANDROID_SHA256] }
}]);

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	if (pathname === '/.well-known/apple-app-site-association') {
		return new Response(aasa, { headers: { 'Content-Type': 'application/json' } });
	}
	if (pathname === '/.well-known/assetlinks.json') {
		return new Response(assetlinks, { headers: { 'Content-Type': 'application/json' } });
	}

	// Resolve session from cookie
	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = token ? getSession(token) : null;

	return resolve(event);
};
