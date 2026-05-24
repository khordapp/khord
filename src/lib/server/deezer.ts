const SEARCH_URL = 'https://api.deezer.com/search/track';

function normalize(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

function looselyMatches(a: string, b: string): boolean {
	const na = normalize(a);
	const nb = normalize(b);
	return na.includes(nb) || nb.includes(na);
}

// Returns the Deezer track URL, or null if not found.
// No credentials required — Deezer search API is public and free.
export async function findDeezerUrl(title: string, artist: string): Promise<string | null> {
	try {
		const q = `artist:"${artist}" track:"${title}"`;
		const params = new URLSearchParams({ q, limit: '5' });
		const res = await fetch(`${SEARCH_URL}?${params}`, { signal: AbortSignal.timeout(5000) });
		if (!res.ok) return null;
		const data = await res.json();
		const results: Array<{ title: string; artist: { name: string }; link: string }> = data.data ?? [];
		for (const track of results) {
			if (looselyMatches(track.title, title) && looselyMatches(track.artist.name, artist)) {
				return track.link;
			}
		}
		return null;
	} catch {
		return null;
	}
}
