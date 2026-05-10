// Unified track search using the iTunes Search API.
// Free, no auth required. Results include appleMusicUrl and artworkUrl used when creating song records.

import { searchItunes } from '$lib/itunes/client';

export interface TrackResult {
	title: string;
	artist: string;
	album?: string;
	year?: string;
	artworkUrl?: string; // 600x600 album art from iTunes CDN
	// Platform URLs — populated when a track is resolved from a direct streaming link;
	// absent when discovered via iTunes search (those come later from /api/resolve).
	appleMusicUrl?: string;
	spotifyUrl?: string;
	youtubeMusicUrl?: string;
	deezerUrl?: string;
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
