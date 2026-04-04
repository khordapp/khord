import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const imageUrl = url.searchParams.get('url');
	if (!imageUrl) return new Response('Missing url', { status: 400 });

	let parsed: URL;
	try {
		parsed = new URL(imageUrl);
	} catch {
		return new Response('Invalid url', { status: 400 });
	}
	if (!['http:', 'https:'].includes(parsed.protocol)) {
		return new Response('Invalid url', { status: 400 });
	}

	const res = await fetch(imageUrl, { headers: { 'user-agent': 'khord/1.0' } });
	if (!res.ok) return new Response('Failed to fetch image', { status: 502 });

	const contentType = res.headers.get('content-type') ?? 'image/jpeg';
	if (!contentType.startsWith('image/')) return new Response('Not an image', { status: 422 });

	const buffer = await res.arrayBuffer();
	return new Response(buffer, {
		headers: { 'content-type': contentType, 'cache-control': 'public, max-age=86400' }
	});
};
