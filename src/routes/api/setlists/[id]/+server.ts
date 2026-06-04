// GET /api/setlists/[id] — fetch a setlist with all items
// PUT /api/setlists/[id] — update title, description, or reorder items (owner only)
// DELETE /api/setlists/[id] — delete setlist and all items (owner only)

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import { getParamId, mapSongRecord, type SetlistRow, type SetlistItemRow } from '$lib/server/utils';

export const GET: RequestHandler = ({ params }) => {
	const id = getParamId(params.id);

	const db = getDb();
	const setlist = db.prepare(`
		SELECT sl.id, sl.title, sl.description, sl.open, sl.created_at, sl.updated_at,
		       sl.user_id, u.username, u.display_name
		FROM setlists sl
		JOIN users u ON u.id = sl.user_id
		WHERE sl.id = ?
	`).get(id) as SetlistRow | undefined;
	if (!setlist) error(404, 'Setlist not found');

	const items = db.prepare(`
		SELECT
			si.id, si.song_id, si.position, si.snapshot, si.added_at,
			si.added_by_user_id,
			adder.username as adder_username,
			s.title, s.artist, s.album, s.thumbnail_url,
			s.spotify_url, s.apple_music_url, s.youtube_music_url,
			s.deezer_url, s.tidal_url, s.amazon_music_url, s.soundcloud_url,
			s.note, s.created_at as song_created_at
		FROM setlist_items si
		LEFT JOIN songs s ON s.id = si.song_id
		LEFT JOIN users adder ON adder.id = si.added_by_user_id
		WHERE si.setlist_id = ?
		ORDER BY si.position ASC
	`).all(id) as SetlistItemRow[];

	return json({
		id:          setlist.id,
		title:       setlist.title,
		description: setlist.description ?? undefined,
		open:        setlist.open === 1,
		tags:        JSON.parse(setlist.tags ?? '[]') as string[],
		createdAt:   setlist.created_at,
		updatedAt:   setlist.updated_at,
		owner: {
			userId:      setlist.user_id,
			username:    setlist.username,
			displayName: setlist.display_name ?? undefined,
		},
		items: items.map((r) => {
			// Use live song data if available, else fall back to snapshot
			const snapshot = r.snapshot ? JSON.parse(r.snapshot) : null;
			const record = r.song_id ? mapSongRecord(r) : snapshot;
			return {
				id:            r.id,
				songId:        r.song_id ?? undefined,
				position:      r.position,
				addedAt:       r.added_at,
				addedBy:       r.adder_username ?? undefined,
				record,
			};
		})
	});
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const user = requireAuth(locals.user);
	const id = getParamId(params.id);

	const db = getDb();
	const setlist = db.prepare('SELECT user_id FROM setlists WHERE id = ?').get(id) as { user_id: number } | undefined;
	if (!setlist) error(404, 'Setlist not found');
	if (setlist.user_id !== user.id && user.role !== 'admin') error(403, 'Not your setlist');

	const body = await request.json().catch(() => null);
	if (!body) error(400, 'Invalid JSON');

	const { title, description, open, tags, items } = body;

	const updates: string[] = ["updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')"];
	const vals: unknown[] = [];
	if (title !== undefined) { updates.push('title = ?'); vals.push(title.trim()); }
	if (description !== undefined) { updates.push('description = ?'); vals.push(description?.trim() ?? null); }
	if (open !== undefined) { updates.push('open = ?'); vals.push(open ? 1 : 0); }
	if (tags !== undefined) {
		const tagsJson = JSON.stringify(
			Array.isArray(tags) ? tags.map(String).filter(Boolean).slice(0, 10) : []
		);
		updates.push('tags = ?'); vals.push(tagsJson);
	}
	vals.push(id);

	db.prepare(`UPDATE setlists SET ${updates.join(', ')} WHERE id = ?`).run(...vals);

	// If items array provided, reorder/sync positions
	if (Array.isArray(items)) {
		const updatePos = db.prepare('UPDATE setlist_items SET position = ? WHERE id = ? AND setlist_id = ?');
		const reorder = db.transaction(() => {
			items.forEach((item: { id: number }, idx: number) => {
				updatePos.run(idx, item.id, id);
			});
		});
		reorder();
	}

	return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = ({ params, locals }) => {
	const user = requireAuth(locals.user);
	const id = getParamId(params.id);

	const db = getDb();
	const setlist = db.prepare('SELECT user_id FROM setlists WHERE id = ?').get(id) as { user_id: number } | undefined;
	if (!setlist) error(404, 'Setlist not found');
	if (setlist.user_id !== user.id && user.role !== 'admin') error(403, 'Not your setlist');

	db.prepare('DELETE FROM setlists WHERE id = ?').run(id);
	return new Response(null, { status: 204 });
};
