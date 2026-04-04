// GET /api/votes?did=...
// Returns all song URIs upvoted by the given actor from the SQLite AppView.
// Returns 503 when DB is unavailable so the client can fall back to PDS fetch.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = ({ url }) => {
	const db = getDb();
	if (!db) error(503, 'AppView not available');

	const did = url.searchParams.get('did');
	if (!did) error(400, 'Missing did parameter');

	const rows = db.prepare(`
		SELECT subject_uri
		FROM votes
		WHERE actor_did = ? AND direction = 'up'
	`).all(did) as { subject_uri: string }[];

	return json({ voted: rows.map((r) => r.subject_uri) });
};
