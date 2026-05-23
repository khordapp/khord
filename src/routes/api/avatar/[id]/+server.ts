import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = ({ params }) => {
	const id = parseInt(params.id, 10);
	if (!id || isNaN(id)) error(404, 'Not found');

	let row: { avatar: Buffer | null; avatar_mime: string | null } | undefined;
	try {
		row = getDb()
			.prepare('SELECT avatar, avatar_mime FROM users WHERE id = ?')
			.get(id) as typeof row;
	} catch {
		error(503, 'Database unavailable');
	}

	if (!row?.avatar) error(404, 'No avatar');

	return new Response(new Uint8Array(row.avatar), {
		headers: {
			'Content-Type': row.avatar_mime ?? 'image/jpeg',
			'Cache-Control': 'public, max-age=3600',
		}
	});
};
