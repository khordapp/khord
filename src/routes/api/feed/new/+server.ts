// GET /api/feed/new?after=<ISO> — lightweight poll used by the Capacitor background task.
// Returns a count of songs posted since `after`, plus up to 5 for notification text.
// Auth: cookie session (locals.user) OR Authorization: Bearer <notification_token>.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = ({ url, locals, request }) => {
	// Resolve user via session cookie or Bearer token
	let authorized = !!locals.user;
	if (!authorized) {
		const auth = request.headers.get('authorization') ?? '';
		const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
		if (bearer) {
			const row = getDb().prepare(
				'SELECT user_id FROM notification_tokens WHERE token = ?'
			).get(bearer) as { user_id: number } | undefined;
			authorized = !!row;
		}
	}
	if (!authorized) error(401, 'Unauthorized');

	const after = url.searchParams.get('after');
	if (!after) return json({ count: 0, songs: [] });

	// Validate ISO string to prevent injection via the query parameter
	const afterDate = new Date(after);
	if (isNaN(afterDate.getTime())) return json({ count: 0, songs: [] });
	const afterIso = afterDate.toISOString();

	const rows = getDb().prepare(`
		SELECT s.title, s.artist, u.username, u.display_name
		FROM songs s
		JOIN users u ON u.id = s.user_id
		WHERE s.listed = 1 AND s.created_at > ?
		ORDER BY s.created_at DESC
		LIMIT 5
	`).all(afterIso) as { title: string; artist: string; username: string; display_name: string | null }[];

	// Count may exceed 5 — do a separate cheap COUNT query
	const { count } = getDb().prepare(`
		SELECT COUNT(*) as count FROM songs
		WHERE listed = 1 AND created_at > ?
	`).get(afterIso) as { count: number };

	return json({
		count,
		songs: rows.map(r => ({
			title: r.title,
			artist: r.artist,
			username: r.username,
			displayName: r.display_name ?? undefined,
		})),
	});
};
