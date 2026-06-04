// GET  /api/pinned-setlists   — returns pinned setlist array with live metadata
// POST /api/pinned-setlists   — owner-only; adds a pin { setlistId }
// DELETE /api/pinned-setlists — owner-only; removes a pin { setlistId }

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner } from '$lib/server/access';
import { getSetting, setSetting } from '$lib/server/settings';
import { getDb } from '$lib/server/db';

export interface PinnedSetlist {
	id: number;
}

function getPinIds(): number[] {
	try {
		const raw = getSetting('pinned_setlists', '');
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		// Support legacy format (array of objects with id field) or plain number array
		if (Array.isArray(parsed)) {
			return parsed.map((p: any) => typeof p === 'number' ? p : p.id).filter(Boolean);
		}
		return [];
	} catch {
		return [];
	}
}

export const GET: RequestHandler = () => {
	const ids = getPinIds();
	if (ids.length === 0) return json({ pins: [] });

	const db = getDb();
	const ph = ids.map(() => '?').join(',');
	const rows = db.prepare(`
		SELECT sl.id, sl.title, sl.open, sl.tags, sl.created_at, sl.user_id,
		       u.username, u.display_name,
		       COUNT(si.id) as item_count
		FROM setlists sl
		JOIN users u ON u.id = sl.user_id
		LEFT JOIN setlist_items si ON si.setlist_id = sl.id
		WHERE sl.id IN (${ph})
		GROUP BY sl.id
	`).all(...ids) as any[];

	const byId = new Map(rows.map((r) => [r.id, r]));
	const pins = ids.flatMap((id) => {
		const r = byId.get(id);
		if (!r) return [];
		return [{
			id:          r.id,
			title:       r.title,
			open:        r.open === 1,
			tags:        JSON.parse(r.tags ?? '[]') as string[],
			createdAt:   r.created_at,
			itemCount:   r.item_count,
			owner: {
				userId:      r.user_id,
				username:    r.username,
				displayName: r.display_name ?? undefined,
			}
		}];
	});

	return json({ pins });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	requireOwner(locals.user);

	const body = await request.json().catch(() => null);
	const setlistId: number = body?.setlistId;
	if (!setlistId) error(400, 'setlistId required');

	const ids = getPinIds();
	if (!ids.includes(setlistId)) {
		ids.push(setlistId);
		setSetting('pinned_setlists', JSON.stringify(ids));
	}

	return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	requireOwner(locals.user);

	const body = await request.json().catch(() => null);
	const setlistId: number = body?.setlistId;
	if (!setlistId) error(400, 'setlistId required');

	const updated = getPinIds().filter((id) => id !== setlistId);
	setSetting('pinned_setlists', JSON.stringify(updated));
	return new Response(null, { status: 204 });
};
