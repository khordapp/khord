import type { RequestHandler } from './$types';
import { getFromCache, saveToCache } from '$lib/server/thumbnailCache';

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

	// Serve from disk cache if available
	const cached = getFromCache(imageUrl);
	if (cached) {
		return new Response(new Uint8Array(cached.buffer), {
			headers: {
				'content-type': cached.contentType,
				'cache-control': 'public, max-age=86400',
				'x-cache': 'HIT'
			}
		});
	}

	// Fetch from upstream
	const res = await fetch(imageUrl, { headers: { 'user-agent': 'khord/1.0' } });
	if (!res.ok) return new Response('Failed to fetch image', { status: 502 });

	const contentType = res.headers.get('content-type') ?? 'image/jpeg';
	if (!contentType.startsWith('image/')) return new Response('Not an image', { status: 422 });

	const buffer = Buffer.from(await res.arrayBuffer());

	// Cache to disk (non-blocking — failure is logged but non-fatal)
	saveToCache(imageUrl, buffer);

	return new Response(buffer, {
		headers: {
			'content-type': contentType,
			'cache-control': 'public, max-age=86400',
			'x-cache': 'MISS'
		}
	});
};
