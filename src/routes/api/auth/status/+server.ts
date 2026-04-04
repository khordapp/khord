// GET /api/auth/status
// Returns public instance access info for the login page.
// Does not expose the actual allowlist — just whether restrictions are active.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDbRw } from '$lib/server/db';

export const GET: RequestHandler = () => {
	const allowedDids = (process.env.ALLOWED_DIDS ?? '').split(',').filter((d) => d.trim());
	const maxUsers = parseInt(process.env.MAX_USERS ?? '0', 10) || 0;

	const restricted = allowedDids.length > 0;
	let full = false;

	if (maxUsers > 0) {
		const db = getDbRw();
		if (db) {
			const { n } = db.prepare('SELECT COUNT(*) as n FROM registered_users').get() as { n: number };
			full = n >= maxUsers;
		}
	}

	const albumArtDisabled = process.env.DISABLE_ALBUM_ART === 'true';

	return json({ restricted, full, maxUsers, albumArtDisabled });
};
