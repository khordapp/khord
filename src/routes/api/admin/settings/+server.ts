// GET  /api/admin/settings?did=   — return current instance settings
// POST /api/admin/settings        — update settings { ownerDid, settings: Record<string,string> }
// Owner-only.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { isOwner } from '$lib/server/access';
import { getAllSettings, setSetting } from '$lib/server/settings';
import { getDbRw } from '$lib/server/db';

// Keys we accept and their env-var defaults (so the UI always has a starting value)
function defaults(): Record<string, string> {
	return {
		album_art_disabled: env.DISABLE_ALBUM_ART === 'true' ? 'true' : 'false',
		registration_closed: 'false',
		max_users: env.MAX_USERS ?? '0',
		feed_scoped: 'false',
		spotify_enabled: 'false',
		youtube_music_enabled: 'false'
	};
}

export const GET: RequestHandler = ({ url }) => {
	const did = url.searchParams.get('did') ?? '';
	if (!isOwner(did)) error(403, 'Forbidden');

	if (!getDbRw()) error(503, 'Database unavailable');

	const stored = getAllSettings();
	const merged = { ...defaults(), ...stored };

	return json(merged);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const ownerDid: string = body?.ownerDid ?? '';
	const incoming: Record<string, string> = body?.settings ?? {};

	if (!isOwner(ownerDid)) error(403, 'Forbidden');
	if (!getDbRw()) error(503, 'Database unavailable');

	const allowed = new Set(['album_art_disabled', 'registration_closed', 'max_users', 'feed_scoped', 'spotify_enabled', 'youtube_music_enabled']);

	for (const [key, value] of Object.entries(incoming)) {
		if (!allowed.has(key)) continue;
		setSetting(key, String(value));
	}

	return json({ ok: true });
};
