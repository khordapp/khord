// GET  /api/admin/settings — return current instance settings. Owner-only.
// POST /api/admin/settings — update settings { settings: Record<string,string> }. Owner-only.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { isOwnerUser } from '$lib/server/access';
import { getAllSettings, setSetting } from '$lib/server/settings';

function defaults(): Record<string, string> {
	return {
		album_art_disabled:   env.DISABLE_ALBUM_ART === 'true' ? 'true' : 'false',
		registration_closed:  'false',
		invite_only:          'false',
		max_users:            env.MAX_USERS ?? '0',
		feed_scoped:          'false',
		spotify_enabled:      'false',
		youtube_music_enabled:'false',
		apple_music_enabled:  'false',
		apple_music_dev_token:''
	};
}

export const GET: RequestHandler = ({ locals }) => {
	const user = locals.user;
	if (!user || !isOwnerUser(user.username, user.email)) error(403, 'Forbidden');

	const stored = getAllSettings();
	return json({ ...defaults(), ...stored });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user || !isOwnerUser(user.username, user.email)) error(403, 'Forbidden');

	const body = await request.json().catch(() => null);
	const incoming: Record<string, string> = body?.settings ?? {};

	const allowed = new Set([
		'album_art_disabled', 'registration_closed', 'invite_only', 'max_users',
		'feed_scoped', 'spotify_enabled', 'youtube_music_enabled',
		'apple_music_enabled', 'apple_music_dev_token'
	]);

	for (const [key, value] of Object.entries(incoming)) {
		if (!allowed.has(key)) continue;
		setSetting(key, String(value));
	}

	return json({ ok: true });
};
