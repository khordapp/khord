// Unified track search using the iTunes Search API.
// Free, no auth required. The appleMusicUrl is used downstream for Odesli resolution
// to obtain all platform links before creating a song record.

import { searchItunes } from '$lib/itunes/client';

export interface TrackResult {
	title: string;
	artist: string;
	album?: string;
	year?: string;
	appleMusicUrl?: string;
	artworkUrl?: string; // 600x600 album art from iTunes CDN
}

export async function searchTracks(query: string, limit = 6): Promise<TrackResult[]> {
	const results = await searchItunes(query, limit);
	return results.map((r) => ({
		title: r.trackName,
		artist: r.artistName,
		album: r.collectionName,
		year: r.releaseDate?.split('-')[0],
		appleMusicUrl: r.trackViewUrl,
		artworkUrl: r.artworkUrl100?.replace('100x100bb', '600x600bb')
	}));
}
