import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 512 * 1024; // 512 KB

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const contentLength = request.headers.get('content-length');
	if (contentLength && parseInt(contentLength, 10) > MAX_BYTES * 2) {
		error(413, 'Avatar too large (max 512 KB)');
	}

	const formData = await request.formData();
	const file = formData.get('avatar');
	if (!(file instanceof File)) error(400, 'Missing avatar file');

	if (!ALLOWED_TYPES.has(file.type)) error(415, 'Unsupported image type — use JPG, PNG, WebP, or GIF');

	const bytes = await file.arrayBuffer();
	if (bytes.byteLength > MAX_BYTES) error(413, 'Avatar too large (max 512 KB)');

	const buf = Buffer.from(bytes);
	getDb()
		.prepare('UPDATE users SET avatar = ?, avatar_mime = ? WHERE id = ?')
		.run(buf, file.type, locals.user.id);

	return json({ ok: true });
};

export const DELETE: RequestHandler = ({ locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	getDb()
		.prepare('UPDATE users SET avatar = NULL, avatar_mime = NULL WHERE id = ?')
		.run(locals.user.id);
	return json({ ok: true });
};
