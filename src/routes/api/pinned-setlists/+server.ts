// GET  /api/pinned-setlists   — public; returns pinned setlist array
// POST /api/pinned-setlists   — owner-only; adds a pin { ownerDid, handle, rkey, title }
// DELETE /api/pinned-setlists — owner-only; removes a pin { ownerDid, handle, rkey }

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isOwner } from '$lib/server/access';
import { getSetting, setSetting } from '$lib/server/settings';

export interface PinnedSetlist {
	handle: string;
	did?: string;
	rkey: string;
	title: string;
	cid?: string;
	itemCount?: number;
	createdAt?: string;
}

function getPins(): PinnedSetlist[] {
	try {
		const raw = getSetting('pinned_setlists', '');
		if (!raw) return [];
		return JSON.parse(raw) as PinnedSetlist[];
	} catch {
		return [];
	}
}

export const GET: RequestHandler = () => {
	return json({ pins: getPins() });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const ownerDid: string = body?.ownerDid ?? '';
	const handle: string = (body?.handle ?? '').trim();
	const did: string = (body?.did ?? '').trim();
	const rkey: string = (body?.rkey ?? '').trim();
	const title: string = (body?.title ?? '').trim();
	const cid: string = (body?.cid ?? '').trim();
	const itemCount: number | undefined = typeof body?.itemCount === 'number' ? body.itemCount : undefined;
	const createdAt: string = (body?.createdAt ?? '').trim();

	if (!isOwner(ownerDid)) error(403, 'Forbidden');
	if (!handle || !rkey || !title) error(400, 'Missing required fields');

	const pins = getPins();
	if (!pins.some((p) => p.handle === handle && p.rkey === rkey)) {
		pins.push({ handle, ...(did && { did }), rkey, title, ...(cid && { cid }), ...(itemCount !== undefined && { itemCount }), ...(createdAt && { createdAt }) });
		setSetting('pinned_setlists', JSON.stringify(pins));
	}

	return json({ pins });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const ownerDid: string = body?.ownerDid ?? '';
	const handle: string = body?.handle ?? '';
	const did: string = (body?.did ?? '').trim();
	const rkey: string = body?.rkey ?? '';

	if (!isOwner(ownerDid)) error(403, 'Forbidden');

	const updated = getPins().filter((p) => !(
		p.rkey === rkey &&
		((did && (p.did === did || p.handle === did)) || p.handle === handle)
	));
	setSetting('pinned_setlists', JSON.stringify(updated));

	return json({ pins: updated });
};
