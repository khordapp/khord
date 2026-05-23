// GET /api/auth/status — returns instance config flags for the current session.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { getDb } from '$lib/server/db';
import { isOwnerUser } from '$lib/server/access';
import { getSetting } from '$lib/server/settings';

export const GET: RequestHandler = ({ locals }) => {
	const maxUsers = parseInt(getSetting('max_users', env.MAX_USERS ?? '0'), 10) || 0;
	let full = false;
	try {
		if (maxUsers > 0) {
			const { n } = getDb().prepare('SELECT COUNT(*) as n FROM users').get() as { n: number };
			full = n >= maxUsers;
		}
	} catch { /* DB unavailable */ }

	const albumArtDisabled =
		getSetting('album_art_disabled', env.DISABLE_ALBUM_ART === 'true' ? 'true' : 'false') === 'true';
	const inviteOnly = getSetting('invite_only', 'false') === 'true';
	const feedScoped = getSetting('feed_scoped', 'false') === 'true';
	const appleMusicEnabled = getSetting('apple_music_enabled', 'false') === 'true';

	const user = locals.user;
	const owner = user ? (user.role === 'admin' || isOwnerUser(user.username, user.email)) : false;

	return json({ restricted: false, full, maxUsers, albumArtDisabled, inviteOnly, feedScoped, isOwner: owner, appleMusicEnabled });
};
