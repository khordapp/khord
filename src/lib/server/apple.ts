import { env } from '$env/dynamic/public';
import { getSetting } from '$lib/server/settings';

const API_BASE = 'https://api.music.apple.com/v1';

interface ApplePlaylistTrack {
	title: string;
	artist: string;
	album?: string;
	artworkUrl?: string;
	sourceUrl: string;
}

function getToken(): string | null {
	// DB setting takes precedence — allows admin to update without server restart
	const dbToken = getSetting('apple_music_dev_token', '');
	return dbToken || env.PUBLIC_APPLE_MUSIC_DEV_TOKEN || null;
}

function buildArtworkUrl(artwork: { url: string }, size: number): string {
	return artwork.url.replace('{w}', String(size)).replace('{h}', String(size));
}

export async function fetchAppleMusicPlaylist(
	id: string,
	storefront = 'us'
): Promise<{ title: string; tracks: ApplePlaylistTrack[] } | null> {
	const token = getToken();
	if (!token) return null;

	try {
		const res = await fetch(
			`${API_BASE}/catalog/${storefront}/playlists/${id}?include=tracks&limit=100`,
			{ headers: { Authorization: `Bearer ${token}` } }
		);
		if (!res.ok) return null;
		const data = await res.json();

		const playlist = data.data?.[0];
		if (!playlist) return null;

		const title = playlist.attributes?.name ?? 'Apple Music Playlist';
		const trackItems: any[] = playlist.relationships?.tracks?.data ?? [];

		const tracks: ApplePlaylistTrack[] = trackItems.slice(0, 50).map((t: any) => ({
			title: t.attributes?.name ?? '',
			artist: t.attributes?.artistName ?? '',
			album: t.attributes?.albumName ?? undefined,
			artworkUrl: t.attributes?.artwork
				? buildArtworkUrl(t.attributes.artwork, 600)
				: undefined,
			sourceUrl:
				t.attributes?.url ?? `https://music.apple.com/${storefront}/song/${t.id}`
		}));

		return { title, tracks };
	} catch {
		return null;
	}
}
