import { env } from '$env/dynamic/public';

export const APP_DOMAIN = 'khord.app';
export const APP_URL    = (env.PUBLIC_APP_URL ?? `https://${APP_DOMAIN}`).replace(/\/$/, '');

// Configurable per instance via environment variables.
// Fall back to Khord defaults so the app works out of the box.
export const APP_NAME             = env.PUBLIC_APP_NAME             ?? 'Khord';
export const APP_TAGLINE          = env.PUBLIC_APP_TAGLINE          ?? 'Share music, listen anywhere.';
export const AUTH_PROVIDER_NAME   = env.PUBLIC_AUTH_PROVIDER_NAME   ?? 'Bluesky';
export const VERSION              = env.PUBLIC_VERSION              ?? 'dev';

export function thumbUrl(url: string | undefined | null): string | undefined {
	if (!url) return undefined;
	return `/api/thumbnail?url=${encodeURIComponent(url)}`;
}
