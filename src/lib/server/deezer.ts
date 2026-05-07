const SEARCH_URL = 'https://api.deezer.com/search/track';

// Returns the Deezer track URL, or null if not found.
// No credentials required — Deezer search API is public and free.
export async function findDeezerUrl(title: string, artist: string): Promise<string | null> {
	try {
		const q = `artist:"${artist}" track:"${title}"`;
		const params = new URLSearchParams({ q, limit: '1' });
		const res = await fetch(`${SEARCH_URL}?${params}`);
		if (!res.ok) return null;
		const data = await res.json();
		return data.data?.[0]?.link ?? null;
	} catch {
		return null;
	}
}
