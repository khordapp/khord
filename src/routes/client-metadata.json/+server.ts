import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { APP_URL, APP_NAME } from '$lib/config';

export function GET() {
	const base = (env.PUBLIC_APP_URL ?? APP_URL).replace(/\/$/, '');

	return json({
		client_id: `${base}/client-metadata.json`,
		client_name: APP_NAME,
		client_uri: base,
		redirect_uris: [`${base}/oauth/callback`],
		scope: 'atproto transition:generic',
		grant_types: ['authorization_code', 'refresh_token'],
		response_types: ['code'],
		token_endpoint_auth_method: 'none',
		application_type: 'web',
		dpop_bound_access_tokens: true
	});
}
