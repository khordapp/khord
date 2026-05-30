// GET /api/setlists — list setlists for the current user (or ?userId=N for public)
// POST /api/setlists — create a new setlist

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = ({ url, locals }) => {
	const userIdParam = url.searchParams.get('userId');
	const userId = userIdParam ? parseInt(userIdParam, 10) : locals.user?.id;
	if (!userId) error(401, 'Not authenticated');

	const db = getDb();
	const rows = db.prepare(`
		SELECT
			sl.id, sl.title, sl.description, sl.open, sl.created_at, sl.updated_at,
			u.username, u.display_name,
			COUNT(si.id) as item_count
		FROM setlists sl
		JOIN users u ON u.id = sl.user_id
		LEFT JOIN setlist_items si ON si.setlist_id = sl.id
		WHERE sl.user_id = ?
		GROUP BY sl.id
		ORDER BY sl.updated_at DESC
	`).all(userId) as any[];

	return json({ setlists: rows.map((r) => ({
		id:          r.id,
		title:       r.title,
		description: r.description ?? undefined,
		open:        r.open === 1,
		createdAt:   r.created_at,
		updatedAt:   r.updated_at,
		itemCount:   r.item_count,
		owner: {
			userId:      userId,
			username:    r.username,
			displayName: r.display_name ?? undefined,
		}
	})) });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireAuth(locals.user);

	const body = await request.json().catch(() => null);
	if (!body) error(400, 'Invalid JSON');

	const { title, description } = body;
	if (!title || typeof title !== 'string') error(400, 'title is required');

	const db = getDb();
	const result = db.prepare(`
		INSERT INTO setlists (user_id, title, description) VALUES (?, ?, ?)
	`).run(user.id, title.trim(), description?.trim() ?? null);

	const row = db.prepare('SELECT id, created_at FROM setlists WHERE id = ?').get(result.lastInsertRowid) as { id: number; created_at: string };
	return json({ id: row.id, createdAt: row.created_at }, { status: 201 });
};
