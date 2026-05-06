// GET /api/auth/status
// Returns public instance access info for the login page.
// Does not expose the actual allowlist — just whether restrictions are active.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { getDbRw } from '$lib/server/db';
import { isOwner } from '$lib/server/access';
import { getSetting } from '$lib/server/settings';

export const GET: RequestHandler = ({ url }) => {
	const allowedDids = (env.ALLOWED_DIDS ?? '').split(',').filter((d) => d.trim());
	const maxUsers = parseInt(env.MAX_USERS ?? '0', 10) || 0;

	const restricted = allowedDids.length > 0;
	let full = false;

	if (maxUsers > 0) {
		const db = getDbRw();
		if (db) {
			const { n } = db.prepare('SELECT COUNT(*) as n FROM registered_users').get() as { n: number };
			full = n >= maxUsers;
		}
	}

	// DB setting takes precedence over env var
	const albumArtDisabled =
		getSetting('album_art_disabled', env.DISABLE_ALBUM_ART === 'true' ? 'true' : 'false') === 'true';

	const inviteOnly = getSetting('invite_only', 'false') === 'true';
	const feedScoped = getSetting('feed_scoped', 'false') === 'true';

	const did = url.searchParams.get('did');
	const owner = did ? isOwner(did) : false;

	return json({ restricted, full, maxUsers, albumArtDisabled, inviteOnly, feedScoped, isOwner: owner });
};
