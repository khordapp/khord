// iTunes Search API — free, no auth required
// Docs: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI

const ITUNES_BASE = 'https://itunes.apple.com';

export interface ItunesTrack {
	trackId: number;
	trackName: string;
	artistName: string;
	collectionName?: string;
	releaseDate?: string; // ISO 8601
	trackViewUrl?: string; // Apple Music URL
}

export async function searchItunes(query: string, limit = 6): Promise<ItunesTrack[]> {
	const params = new URLSearchParams({ term: query, entity: 'song', limit: String(limit) });
	const res = await fetch(`${ITUNES_BASE}/search?${params}`);
	if (!res.ok) throw new Error(`iTunes search failed (${res.status})`);
	const data = await res.json();
	return data.results ?? [];
}
