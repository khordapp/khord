// Odesli (song.link) API client
// Docs: https://odesli.co (no official docs page; API is public)
// Endpoint: https://api.song.link/v1-alpha.1/links

const ODESLI_BASE = 'https://api.song.link/v1-alpha.1';

export type Platform =
	| 'spotify'
	| 'appleMusic'
	| 'youtube'
	| 'youtubeMusic'
	| 'tidal'
	| 'amazonMusic'
	| 'soundcloud'
	| 'deezer'
	| 'pandora';

export interface OdesliPlatformLink {
	country: string;
	url: string;
	entityUniqueId: string;
	nativeAppUriMobile?: string;
	nativeAppUriDesktop?: string;
}

export interface OdesliEntity {
	id: string;
	type: 'song' | 'album';
	title?: string;
	artistName?: string;
	thumbnailUrl?: string;
	thumbnailWidth?: number;
	thumbnailHeight?: number;
	apiProvider: string;
	platforms: string[];
}

export interface OdesliResponse {
	entityUniqueId: string;
	userCountry: string;
	pageUrl: string;
	entitiesByUniqueId: Record<string, OdesliEntity>;
	linksByPlatform: Record<string, OdesliPlatformLink>;
}

export async function resolveUrl(url: string, userCountry = 'US'): Promise<OdesliResponse> {
	const params = new URLSearchParams({ url, userCountry });
	const res = await fetch(`${ODESLI_BASE}/links?${params}`);
	if (!res.ok) throw new Error(`Odesli error ${res.status}: ${await res.text()}`);
	return res.json();
}

export async function resolveIsrc(isrc: string, userCountry = 'US'): Promise<OdesliResponse> {
	const params = new URLSearchParams({ id: isrc, type: 'isrc', userCountry });
	const res = await fetch(`${ODESLI_BASE}/links?${params}`);
	if (!res.ok) throw new Error(`Odesli error ${res.status}: ${await res.text()}`);
	return res.json();
}

export function getPlatformUrl(response: OdesliResponse, platform: Platform): string | undefined {
	return response.linksByPlatform[platform]?.url;
}

export function getCanonicalEntity(response: OdesliResponse): OdesliEntity | undefined {
	return response.entitiesByUniqueId[response.entityUniqueId];
}

/** Extract all supported platform URLs from an Odesli response for storage in a song record. */
export function extractPlatformUrls(response: OdesliResponse): {
	odesliKey: string;
	thumbnailUrl?: string;
	spotifyUrl?: string;
	appleMusicUrl?: string;
	youtubeMusicUrl?: string;
	deezerUrl?: string;
	tidalUrl?: string;
	amazonMusicUrl?: string;
	soundcloudUrl?: string;
	songlinkUrl?: string;
} {
	const p = response.linksByPlatform;
	const entity = getCanonicalEntity(response);
	return {
		odesliKey: response.entityUniqueId,
		thumbnailUrl: entity?.thumbnailUrl,
		spotifyUrl: p['spotify']?.url,
		appleMusicUrl: p['appleMusic']?.url,
		youtubeMusicUrl: p['youtubeMusic']?.url,
		deezerUrl: p['deezer']?.url,
		tidalUrl: p['tidal']?.url,
		amazonMusicUrl: p['amazonMusic']?.url,
		soundcloudUrl: p['soundcloud']?.url,
		songlinkUrl: response.pageUrl
	};
}
