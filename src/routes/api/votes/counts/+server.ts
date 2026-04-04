// GET /api/votes/counts?uris=uri1,uri2,...
// Returns upvote counts for the given song URIs from the SQLite AppView.
// Returns 503 when DB is unavailable so the client can degrade gracefully.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = ({ url }) => {
	const db = getDb();
	if (!db) error(503, 'AppView not available');

	const urisParam = url.searchParams.get('uris');
	if (!urisParam) error(400, 'Missing uris parameter');

	const uris = urisParam.split(',').filter(Boolean);
	if (uris.length === 0) error(400, 'No URIs provided');

	const placeholders = uris.map(() => '?').join(',');

	const rows = db.prepare(`
		SELECT subject_uri, COUNT(*) as count
		FROM votes
		WHERE direction = 'up' AND subject_uri IN (${placeholders})
		GROUP BY subject_uri
	`).all(...uris) as { subject_uri: string; count: number }[];

	const counts: Record<string, number> = {};
	for (const row of rows) {
		counts[row.subject_uri] = row.count;
	}

	return json({ counts });
};
