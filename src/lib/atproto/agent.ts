import { BrowserOAuthClient, LoginContinuedInParentWindowError } from '@atproto/oauth-client-browser';
import { Agent } from '@atproto/api';
import { browser } from '$app/environment';
import { APP_URL, APP_NAME } from '$lib/config';
import { env } from '$env/dynamic/public';

export { LoginContinuedInParentWindowError };

let _client: BrowserOAuthClient | null = null;
let _agent: Agent | null = null;

function getBaseUrl(): string {
	// PUBLIC_APP_URL must be set to a publicly accessible URL (tunnel or production).
	// AT Protocol OAuth requires the authorization server to be able to fetch client
	// metadata — it cannot reach http://localhost.
	const url = env.PUBLIC_APP_URL ?? APP_URL;
	return url.replace(/\/$/, '');
}

async function getClient(): Promise<BrowserOAuthClient> {
	if (_client) return _client;

	const base = getBaseUrl();

	_client = new BrowserOAuthClient({
		handleResolver: 'https://bsky.social',
		clientMetadata: {
			client_id: `${base}/client-metadata.json`,
			client_name: APP_NAME,
			client_uri: base,
			redirect_uris: [`${base}/oauth/callback`] as [string],
			scope: 'atproto transition:generic',
			grant_types: ['authorization_code', 'refresh_token'] as ['authorization_code', 'refresh_token'],
			response_types: ['code'] as ['code'],
			token_endpoint_auth_method: 'none' as 'none',
			application_type: 'web' as 'web',
			dpop_bound_access_tokens: true
		}
	});

	return _client;
}

// init() handles both session restoration and OAuth callbacks.
// Call it on every page load — it detects code/state params automatically.
// On the OAuth callback page, errors are allowed to propagate.
// On other pages, pass allowFailure: true to suppress errors (session restore).
export async function initAuth(allowFailure = false): Promise<{ did: string; handle: string; avatar?: string } | null> {
	if (!browser) return null;
	try {
		const client = await getClient();
		const result = await client.init();
		if (!result) return null;
		_agent = new Agent(result.session);
		const did = result.session.did;
		let handle: string = did;
		let avatar: string | undefined;
		try {
			const profile = await _agent.getProfile({ actor: did });
			handle = profile.data.handle;
			avatar = profile.data.avatar;
		} catch {
			// Non-fatal — fall back to DID as handle
		}
		return { did, handle, avatar };
	} catch (e) {
		if (allowFailure) return null;
		throw e;
	}
}

// Signs in via redirect to Bluesky authorization page.
// The browser navigates away; on return, the /oauth/callback page completes the flow.
export async function signIn(handle: string): Promise<void> {
	const base = getBaseUrl();
	if (browser && !env.PUBLIC_APP_URL && import.meta.env.DEV) {
		throw new Error(
			'Set PUBLIC_APP_URL in .env to your tunnel URL to use OAuth locally. ' +
			'Run: npx cloudflared tunnel --url http://localhost:5173'
		);
	}
	const client = await getClient();
	await client.signIn(handle);
}


export async function signOut(): Promise<void> {
	_agent = null;
	// Leave the AT Protocol session in IndexedDB so the next sign-in can call
	// restore() silently — without triggering Bluesky's consent screen again.
	// The flag tells the layout not to auto-restore on page load.
	try { localStorage.setItem('khord_signed_out', 'true'); } catch {}
}

// Silently restores a stored session by DID using the saved refresh token.
// Returns user info on success, null if the session is expired or absent.
export async function tryRestoreSession(did: string): Promise<{ did: string; handle: string; avatar?: string } | null> {
	if (!browser) return null;
	try {
		const client = await getClient();
		const oauthSession = await client.restore(did);
		_agent = new Agent(oauthSession);
		let handle: string = did;
		let avatar: string | undefined;
		try {
			const profile = await _agent.getProfile({ actor: did });
			handle = profile.data.handle;
			avatar = profile.data.avatar;
		} catch {}
		return { did, handle, avatar };
	} catch {
		_agent = null;
		return null;
	}
}

export function getAgent(): Agent {
	if (!_agent) throw new Error('Not authenticated');
	return _agent;
}
