<script lang="ts">
	import { page } from '$app/state';
	import { session, authReady } from '$lib/stores/auth';
	import { updateSetlist, deleteSetlist, createProposal, fetchProposalsFromPDSes, getFollowing } from '$lib/atproto/social';
	import type { FollowedUser } from '$lib/atproto/social';
	import type { KhordSetlist, KhordSetlistItem, KhordSetlistRecord } from '$lib/atproto/lexicons/setlist';
	import type { KhordSongRecord } from '$lib/atproto/lexicons/song';
	import { SONG_NSID } from '$lib/atproto/lexicons/song';
	import type { KhordProposal } from '$lib/atproto/lexicons/proposal';
	import { getAgent } from '$lib/atproto/agent';
	import type { PageData } from './$types';

	export let data: PageData;
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import { goto } from '$app/navigation';
	import { APP_NAME, APP_URL, thumbUrl } from '$lib/config';
	import { votes } from '$lib/stores/votes';
	import { instanceConfig } from '$lib/stores/instance';
	import { prefs, type PlatformKey } from '$lib/stores/prefs';
	import { theme as t } from '$lib/theme';

	const PLATFORMS: { key: PlatformKey; label: string; color: string }[] = [
		{ key: 'spotifyUrl',      label: 'Spotify',       color: '#1DB954' },
		{ key: 'appleMusicUrl',   label: 'Apple Music',   color: '#FC3C44' },
		{ key: 'youtubeMusicUrl', label: 'YouTube Music', color: '#FF0000' },
		{ key: 'tidalUrl',        label: 'Tidal',         color: '#9bf0e1' },
		{ key: 'deezerUrl',       label: 'Deezer',        color: '#EF5466' },
		{ key: 'amazonMusicUrl',  label: 'Amazon Music',  color: '#00A8E1' },
		{ key: 'soundcloudUrl',   label: 'SoundCloud',    color: '#FF5500' },
	];

	function getPrimaryPlatform(rec: KhordSongRecord) {
		const available = PLATFORMS.filter((p) => rec[p.key]);
		return available.find((p) => p.key === $prefs) ?? available[0] ?? null;
	}
	import { searchTracks, type TrackResult } from '$lib/search';

	const handle: string = page.params.handle ?? '';
	const rkey: string = page.params.rkey ?? '';

	interface DndItem {
		id: string;
		item: KhordSetlistItem;
		record: KhordSongRecord | null;
	}

	let setlist: KhordSetlist | null = data.setlist
		? { uri: data.setlist.uri, cid: data.setlist.cid, value: data.setlist.value }
		: null;
	let sharedBy: FollowedUser | null = data.sharedBy;
	let dndItems: DndItem[] = data.setlist
		? data.setlist.value.items.map((item) => ({
			id: item.songUri,
			item,
			record: item.snapshot
				? ({ ...item.snapshot, createdAt: item.addedAt } as KhordSongRecord)
				: null
		}))
		: [];
	let loading = !data.setlist;
	let error = '';
	let editMode = false;
	let saving = false;
	let deleting = false;
	let confirmDeleteOpen = false;
	let editingTitle = false;
	let titleDraft = '';
	let titleInputEl: HTMLInputElement | undefined;

	// Add song
	let addOpen = false;
	let addQuery = '';
	let addSearching = false;
	let addResults: TrackResult[] = [];
	let addResolving = false;
	let addError = '';
	let addShareToFeed = false;
	let addDebounceTimer: ReturnType<typeof setTimeout>;

	$: if (addQuery.trim().length >= 2) {
		clearTimeout(addDebounceTimer);
		addDebounceTimer = setTimeout(doAddSearch, 350);
	} else {
		clearTimeout(addDebounceTimer);
		addResults = [];
	}

	async function doAddSearch() {
		addSearching = true;
		try {
			addResults = await searchTracks(addQuery.trim());
		} catch {
			addResults = [];
		} finally {
			addSearching = false;
		}
	}

	function focusEl(el: HTMLElement) { el.focus(); }

	async function addSongToSetlist(track: TrackResult) {
		if (!$session || !setlist || addResolving) return;
		addResolving = true;
		addError = '';
		addQuery = '';
		addResults = [];
		try {
			let phase1: { spotifyUrl?: string; youtubeMusicUrl?: string; deezerUrl?: string } = {};
			if (track.title && track.artist) {
				const p = new URLSearchParams({ title: track.title, artist: track.artist });
				const r = await fetch(`/api/resolve?${p}`);
				if (r.ok) phase1 = await r.json();
			}

			const record: KhordSongRecord = {
				title: track.title,
				artist: track.artist,
				...(track.album        && { album:          track.album }),
				...(track.artworkUrl   && { thumbnailUrl:   track.artworkUrl }),
				...(track.appleMusicUrl && { appleMusicUrl: track.appleMusicUrl }),
				...(phase1.spotifyUrl       && { spotifyUrl:      phase1.spotifyUrl }),
				...(phase1.youtubeMusicUrl  && { youtubeMusicUrl: phase1.youtubeMusicUrl }),
				...(phase1.deezerUrl        && { deezerUrl:       phase1.deezerUrl }),
				instanceUrl: APP_URL,
				createdAt: new Date().toISOString()
			};

			const createRes = await getAgent().com.atproto.repo.createRecord({
				repo: $session.did,
				collection: SONG_NSID,
				record: { $type: SONG_NSID, ...record, listed: addShareToFeed }
			});

			const newItem: KhordSetlistItem = {
				songUri: createRes.data.uri,
				songCid: createRes.data.cid,
				addedBy: $session.did,
				addedAt: new Date().toISOString(),
				snapshot: {
					title: record.title,
					artist: record.artist,
					...(record.album && { album: record.album }),
					...(record.thumbnailUrl && { thumbnailUrl: record.thumbnailUrl }),
					...(record.appleMusicUrl && { appleMusicUrl: record.appleMusicUrl }),
					...(record.spotifyUrl && { spotifyUrl: record.spotifyUrl }),
					...(record.youtubeMusicUrl && { youtubeMusicUrl: record.youtubeMusicUrl }),
					...(record.deezerUrl && { deezerUrl: record.deezerUrl }),
					...(record.tidalUrl && { tidalUrl: record.tidalUrl }),
					...(record.amazonMusicUrl && { amazonMusicUrl: record.amazonMusicUrl }),
					...(record.soundcloudUrl && { soundcloudUrl: record.soundcloudUrl })
				}
			};

			const updated: KhordSetlistRecord = {
				...setlist.value,
				items: [...setlist.value.items, newItem]
			};
			await updateSetlist($session.did, rkey, updated);
			setlist = { ...setlist, value: updated };
			dndItems = [...dndItems, { id: newItem.songUri, item: newItem, record }];
		} catch (e) {
			addError = e instanceof Error ? e.message : 'Failed to add song.';
		} finally {
			addResolving = false;
		}
	}

	// Propose song (non-owner)
	let proposeOpen = false;
	let proposeQuery = '';
	let proposeSearching = false;
	let proposeResults: TrackResult[] = [];
	let proposeResolving = false;
	let proposeNote = '';
	let proposeError = '';
	let proposeSubmitted = false;
	let proposeDebounceTimer: ReturnType<typeof setTimeout>;

	$: if (proposeQuery.trim().length >= 2) {
		clearTimeout(proposeDebounceTimer);
		proposeDebounceTimer = setTimeout(doProposeSearch, 350);
	} else {
		clearTimeout(proposeDebounceTimer);
		proposeResults = [];
	}

	async function doProposeSearch() {
		proposeSearching = true;
		try {
			proposeResults = await searchTracks(proposeQuery.trim());
		} catch {
			proposeResults = [];
		} finally {
			proposeSearching = false;
		}
	}

	async function submitProposal(track: TrackResult) {
		if (!$session || !setlist || proposeResolving) return;
		proposeResolving = true;
		proposeError = '';
		proposeQuery = '';
		proposeResults = [];
		try {
			let phase1: { spotifyUrl?: string; youtubeMusicUrl?: string; deezerUrl?: string } = {};
			if (track.title && track.artist) {
				const p = new URLSearchParams({ title: track.title, artist: track.artist });
				const r = await fetch(`/api/resolve?${p}`);
				if (r.ok) phase1 = await r.json();
			}

			const snapshot = {
				title: track.title,
				artist: track.artist,
				...(track.album        && { album:          track.album }),
				...(track.artworkUrl   && { thumbnailUrl:   track.artworkUrl }),
				...(track.appleMusicUrl && { appleMusicUrl: track.appleMusicUrl }),
				...(phase1.spotifyUrl       && { spotifyUrl:      phase1.spotifyUrl }),
				...(phase1.youtubeMusicUrl  && { youtubeMusicUrl: phase1.youtubeMusicUrl }),
				...(phase1.deezerUrl        && { deezerUrl:       phase1.deezerUrl }),
			};

			await createProposal(
				$session.did,
				setlist.uri,
				setlist.cid,
				snapshot,
				proposeNote
			);
			proposeSubmitted = true;
			proposeNote = '';
			setTimeout(() => {
				proposeSubmitted = false;
				proposeOpen = false;
			}, 2000);
		} catch (e) {
			proposeError = e instanceof Error ? e.message : 'Failed to submit proposal.';
		} finally {
			proposeResolving = false;
		}
	}

	// Proposals (owner)
	let proposals: KhordProposal[] = [];
	let proposalsLoading = false;
	let acceptingUri: string | null = null;

	const DISMISSED_KEY = `khord_dismissed_proposals_${rkey}`;

	function getDismissed(): Set<string> {
		try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]')); }
		catch { return new Set(); }
	}

	function persistDismiss(uri: string) {
		try {
			const s = getDismissed();
			s.add(uri);
			localStorage.setItem(DISMISSED_KEY, JSON.stringify([...s]));
		} catch { /* non-fatal */ }
	}

	async function loadProposals() {
		if (!setlist) return;
		proposalsLoading = true;
		try {
			const res = await fetch(`/api/proposals?setlistUri=${encodeURIComponent(setlist.uri)}`);
			const dismissed = getDismissed();
			if (res.ok) {
				const data = await res.json();
				proposals = data.proposals.filter((p: KhordProposal) => !dismissed.has(p.uri));
			} else {
				// Fallback: query followers' PDSes directly
				const followerDids = $session
					? (await getFollowing($session.did)).map((f) => f.did)
					: [];
				// Also include the current user's own DID (useful for dev/testing)
				const dids = $session ? [...new Set([...(followerDids), $session.did])] : followerDids;
				const all = dids.length > 0
					? await fetchProposalsFromPDSes(setlist.uri, dids)
					: [];
				proposals = all.filter((p) => !dismissed.has(p.uri));
			}
		} catch {
			// non-fatal — no proposals shown
		} finally {
			proposalsLoading = false;
		}
	}

	async function acceptProposal(proposal: KhordProposal) {
		if (!$session || !setlist || acceptingUri) return;
		acceptingUri = proposal.uri;
		try {
			const s = proposal.value.snapshot;
			const songRecord: KhordSongRecord = {
				title: s.title,
				artist: s.artist,
				...(s.album && { album: s.album }),
				...(s.thumbnailUrl && { thumbnailUrl: s.thumbnailUrl }),
				...(s.spotifyUrl && { spotifyUrl: s.spotifyUrl }),
				...(s.appleMusicUrl && { appleMusicUrl: s.appleMusicUrl }),
				...(s.youtubeMusicUrl && { youtubeMusicUrl: s.youtubeMusicUrl }),
				...(s.tidalUrl && { tidalUrl: s.tidalUrl }),
				...(s.deezerUrl && { deezerUrl: s.deezerUrl }),
				...(s.amazonMusicUrl && { amazonMusicUrl: s.amazonMusicUrl }),
				...(s.soundcloudUrl && { soundcloudUrl: s.soundcloudUrl }),
				...(s.songlinkUrl && { songlinkUrl: s.songlinkUrl }),
				listed: false,
				createdAt: new Date().toISOString()
			};

			const createRes = await getAgent().com.atproto.repo.createRecord({
				repo: $session.did,
				collection: SONG_NSID,
				record: { $type: SONG_NSID, ...songRecord }
			});

			const newItem: KhordSetlistItem = {
				songUri: createRes.data.uri,
				songCid: createRes.data.cid,
				addedBy: $session.did,
				addedAt: new Date().toISOString(),
				snapshot: s
			};

			const updated: KhordSetlistRecord = {
				...setlist.value,
				items: [...setlist.value.items, newItem]
			};
			await updateSetlist($session.did, rkey, updated);
			setlist = { ...setlist, value: updated };
			dndItems = [...dndItems, { id: newItem.songUri, item: newItem, record: songRecord }];
			persistDismiss(proposal.uri);
			proposals = proposals.filter((p) => p.uri !== proposal.uri);
		} catch (e) {
			proposeError = e instanceof Error ? e.message : 'Failed to accept proposal.';
		} finally {
			acceptingUri = null;
		}
	}

	function dismissProposal(uri: string) {
		persistDismiss(uri);
		proposals = proposals.filter((p) => p.uri !== uri);
	}

	// Vote counts
	let voteCounts = new Map<string, number>();

	// Per-card like
	let liking = new Set<string>();
	$: likedUris = $votes;

	async function toggleSongLike(uri: string, cid: string) {
		if (!$session || liking.has(uri)) return;
		liking.add(uri); liking = liking;
		const wasLiked = likedUris.has(uri);
		voteCounts.set(uri, Math.max(0, (voteCounts.get(uri) ?? 0) + (wasLiked ? -1 : 1)));
		voteCounts = voteCounts;
		try {
			if (wasLiked) await votes.unlike($session.did, uri);
			else await votes.like($session.did, uri, cid);
		} catch {
			voteCounts.set(uri, Math.max(0, (voteCounts.get(uri) ?? 0) + (wasLiked ? 1 : -1)));
			voteCounts = voteCounts;
		} finally {
			liking.delete(uri); liking = liking;
		}
	}

	// Per-card resync
	let resyncing = new Set<string>();
	let resynced = new Set<string>();
	let resyncErrors = new Map<string, string>();

	async function resyncSong(dndItem: DndItem) {
		const uri = dndItem.id;
		const record = dndItem.record;
		if (!$session || !record || resyncing.has(uri)) return;
		resyncing.add(uri); resyncing = resyncing;
		resyncErrors.delete(uri); resyncErrors = resyncErrors;
		try {
			const p = new URLSearchParams({ title: record.title, artist: record.artist });
			const res = await fetch(`/api/resolve?${p}`);
			if (!res.ok) throw new Error(`Resolve failed (${res.status})`);
			const { spotifyUrl, youtubeMusicUrl, deezerUrl } = await res.json();
			const updated: KhordSongRecord = {
				...record,
				...(spotifyUrl      && { spotifyUrl }),
				...(youtubeMusicUrl && { youtubeMusicUrl }),
				...(deezerUrl       && { deezerUrl }),
			};
			const itemRkey = uri.split('/').pop()!;
			await getAgent().com.atproto.repo.putRecord({ repo: $session.did, collection: SONG_NSID, rkey: itemRkey, record: { $type: SONG_NSID, ...updated } });
			dndItems = dndItems.map(d => d.id === uri ? { ...d, record: updated } : d);
			resynced.add(uri); resynced = resynced;
			setTimeout(() => { resynced.delete(uri); resynced = resynced; }, 3000);
		} catch (e) {
			resyncErrors.set(uri, e instanceof Error ? e.message : 'Resync failed.'); resyncErrors = resyncErrors;
			setTimeout(() => { resyncErrors.delete(uri); resyncErrors = resyncErrors; }, 4000);
		} finally {
			resyncing.delete(uri); resyncing = resyncing;
		}
	}

	// Per-card native share
	let songShared = new Set<string>();

	async function shareNativeSong(uri: string, rec: KhordSongRecord) {
		const parts = uri.split('/');
		const repoDid = parts[2];
		const itemRkey = parts[parts.length - 1];
		const shareUrl = repoDid && itemRkey
			? `${APP_URL}/song/${repoDid}/${itemRkey}`
			: (rec.songlinkUrl ?? '');
		if (!shareUrl) return;
		const title = `${rec.title}${rec.artist ? ` by ${rec.artist}` : ''}`;
		if (navigator.share) {
			try { await navigator.share({ title, url: shareUrl }); } catch { /* cancelled */ }
		} else {
			try {
				await navigator.clipboard.writeText(shareUrl);
				songShared.add(uri); songShared = songShared;
				setTimeout(() => { songShared.delete(uri); songShared = songShared; }, 2000);
			} catch { /* clipboard unavailable */ }
		}
	}

	// Mixtape native share
	$: setlistUrl = `${APP_URL}/s/${handle}/${rkey}`;
	let sharePosted = false;

	async function shareNativeMixtape() {
		if (!setlist) return;
		if (navigator.share) {
			try { await navigator.share({ title: setlist.value.title, url: setlistUrl }); } catch { /* cancelled */ }
		} else {
			try {
				await navigator.clipboard.writeText(setlistUrl);
				sharePosted = true;
				setTimeout(() => { sharePosted = false; }, 2000);
			} catch { /* clipboard unavailable */ }
		}
	}



	$: ogTitle = setlist?.value.title ?? 'Mixtape';
	$: ogDesc = `${setlist?.value.items.length ?? 0} song${(setlist?.value.items.length ?? 0) === 1 ? '' : 's'} · a mixtape by @${sharedBy?.handle ?? handle} on ${APP_NAME}. Listen anywhere on Spotify, Apple Music, and more.`;
	const ogImage = `${APP_URL}/apple-touch-icon.png`;

	$: isOwn = $session?.handle === handle;

	async function load() {
		error = '';

		if (!data.setlist) {
			// SSR failed — fetch via public AT Protocol APIs (no auth needed)
			loading = true;
			try {
				const resolveRes = await fetch(
					`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
				);
				if (!resolveRes.ok) throw new Error('Could not resolve handle.');
				const { did } = await resolveRes.json();

				let pds = 'https://bsky.social';
				if (did.startsWith('did:plc:')) {
					const plcRes = await fetch(`https://plc.directory/${encodeURIComponent(did)}`);
					if (plcRes.ok) {
						const doc = await plcRes.json();
						const endpoint = (doc.service ?? []).find(
							(s: { id: string }) => s.id === '#atproto_pds'
						)?.serviceEndpoint;
						if (endpoint) pds = endpoint;
					}
				}

				const recordRes = await fetch(
					`${pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=app.khord.setlist&rkey=${encodeURIComponent(rkey)}`
				);
				if (!recordRes.ok) throw new Error('Mixtape not found.');
				const { uri, cid, value } = await recordRes.json();
				setlist = { uri, cid, value: value as KhordSetlistRecord };

				const profileRes = await fetch(
					`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`
				);
				if (profileRes.ok) {
					const p = await profileRes.json();
					sharedBy = { did, handle: p.handle ?? handle, displayName: p.displayName, avatar: p.avatar };
				}

				dndItems = setlist.value.items.map((item) => ({
					id: item.songUri,
					item,
					record: item.snapshot ? ({ ...item.snapshot, createdAt: item.addedAt } as KhordSongRecord) : null
				}));
			} catch (e) {
				error = e instanceof Error ? e.message : 'Could not load mixtape.';
				loading = false;
				return;
			}
			loading = false;
		}

		if (!setlist) return;

		// Enrich with live PDS records when authenticated
		if ($session) {
			try {
				const liveRecords = await Promise.allSettled(
					setlist.value.items.map((item) => {
						const parts = item.songUri.split('/');
						const repoDid = parts[2];
						const itemRkey = parts[parts.length - 1];
						return getAgent().com.atproto.repo.getRecord({
							repo: repoDid,
							collection: SONG_NSID,
							rkey: itemRkey
						}).then((r) => r.data.value as KhordSongRecord);
					})
				);
				dndItems = setlist.value.items.map((item, i) => {
					const live = liveRecords[i].status === 'fulfilled'
						? (liveRecords[i] as PromiseFulfilledResult<KhordSongRecord>).value
						: null;
					const record: KhordSongRecord | null = live ?? (item.snapshot ? { ...item.snapshot, createdAt: item.addedAt } : null);
					return { id: item.songUri, item, record };
				});
			} catch { /* non-fatal — keep snapshot-based records */ }
		}

		// Vote counts (no auth needed)
		const uris = setlist.value.items.map((i) => i.songUri);
		if (uris.length > 0) {
			try {
				const res = await fetch(`/api/votes/counts?uris=${uris.map(encodeURIComponent).join(',')}`);
				if (res.ok) {
					const voteData = await res.json();
					voteCounts = new Map(Object.entries(voteData.counts as Record<string, number>));
				}
			} catch { /* non-fatal */ }
		}

		if ($session?.handle === handle) loadProposals();
	}

	$: if ($authReady) load();

	function handleDndConsider(e: CustomEvent<{ items: DndItem[] }>) {
		dndItems = e.detail.items;
	}

	async function handleDndFinalize(e: CustomEvent<{ items: DndItem[] }>) {
		dndItems = e.detail.items;
		if (!setlist || !$session || !isOwn) return;
		saving = true;
		try {
			const updated: KhordSetlistRecord = { ...setlist.value, items: dndItems.map((d) => d.item) };
			await updateSetlist($session.did, rkey, updated);
			setlist = { ...setlist, value: updated };
		} finally {
			saving = false;
		}
	}

	async function removeItem(songUri: string) {
		if (!setlist || !$session || !isOwn) return;
		saving = true;
		try {
			const updated: KhordSetlistRecord = {
				...setlist.value,
				items: setlist.value.items.filter((i) => i.songUri !== songUri)
			};
			await updateSetlist($session.did, rkey, updated);
			setlist = { ...setlist, value: updated };
			dndItems = dndItems.filter((d) => d.id !== songUri);
		} finally {
			saving = false;
		}
	}

	async function saveTitle() {
		if (!setlist || !$session || !isOwn || !titleDraft.trim()) return;
		saving = true;
		try {
			const updated: KhordSetlistRecord = { ...setlist.value, title: titleDraft.trim() };
			await updateSetlist($session.did, rkey, updated);
			setlist = { ...setlist, value: updated };
			editingTitle = false;
		} finally {
			saving = false;
		}
	}

	function startEditTitle() {
		titleDraft = setlist?.value.title ?? '';
		editingTitle = true;
		setTimeout(() => titleInputEl?.focus(), 0);
	}

	async function handleDelete() {
		if (!$session || deleting) return;
		deleting = true;
		try {
			await deleteSetlist($session.did, rkey);
			goto('/');
		} finally {
			deleting = false;
		}
	}

	function timeAgo(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const m = Math.floor(diff / 60000);
		if (m < 1) return 'just now';
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		const d = Math.floor(h / 24);
		if (d < 7) return `${d}d ago`;
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>{ogTitle} — {APP_NAME}</title>
	<meta name="description" content={ogDesc} />
	<meta property="og:title" content="{ogTitle} — {APP_NAME}" />
	<meta property="og:description" content={ogDesc} />
	<meta property="og:url" content={setlistUrl} />
	<meta property="og:type" content="website" />
	{#if ogImage}<meta property="og:image" content={ogImage} />{/if}
	<meta name="twitter:card" content={ogImage ? 'summary_large_image' : 'summary'} />
	<meta name="twitter:title" content="{ogTitle} — {APP_NAME}" />
	<meta name="twitter:description" content={ogDesc} />
	{#if ogImage}<meta name="twitter:image" content={ogImage} />{/if}
</svelte:head>

<!-- Delete confirm modal -->
{#if confirmDeleteOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button class="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Cancel" on:click={() => (confirmDeleteOpen = false)}></button>
		<div class="relative w-full max-w-sm {$t.surfaceBg} border {$t.borderStrong} rounded-2xl shadow-2xl overflow-hidden">
			<div class="px-5 pt-5 pb-4 space-y-2">
				<h2 class="text-sm font-semibold {$t.textPrimary}">Delete mixtape?</h2>
				<p class="text-xs {$t.textMuted}">"{setlist?.value.title}" will be permanently deleted from your AT Protocol account.</p>
			</div>
			<div class="flex border-t {$t.borderBase}">
				<button on:click={() => (confirmDeleteOpen = false)} class="flex-1 px-4 py-3 text-sm {$t.textMuted} {$t.hoverText} {$t.hoverBg} transition-colors">Cancel</button>
				<button on:click={handleDelete} disabled={deleting}
					class="flex-1 px-4 py-3 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-950 border-l {$t.borderBase} transition-colors disabled:opacity-50">
					{#if deleting}<span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>{:else}Delete{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<section class="space-y-6">
	<!-- Header -->
	<div class="sticky top-0 z-20 -mx-6 px-6 py-3 {$t.headerBg} backdrop-blur-sm border-b {$t.borderFaded} space-y-1.5">
		<!-- Title row: back link left | title center | edit right -->
		{#if editingTitle && isOwn}
			<form on:submit|preventDefault={saveTitle} class="flex items-center gap-2">
				<input
					bind:this={titleInputEl}
					bind:value={titleDraft}
					maxlength="100"
					class="flex-1 min-w-0 {$t.elevatedBg} border {$t.borderStrong} rounded-lg px-3 py-1.5 text-base font-semibold {$t.textPrimary} focus:outline-none {$t.hoverBorderStrong} transition-colors"
				/>
				<button type="submit" disabled={saving} class="shrink-0 text-xs {$t.textSecondary} {$t.hoverText} px-2.5 py-1 border {$t.borderStrong} rounded-full transition-colors disabled:opacity-50">Save</button>
				<button type="button" on:click={() => (editingTitle = false)} aria-label="Cancel" class="shrink-0 {$t.textMuted} {$t.hoverTextSecondary} transition-colors">
					<svg viewBox="0 0 14 14" fill="none" class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg">
						<path d="M2 2l10 10M12 2 2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
				</button>
			</form>
		{:else}
			<div class="flex items-center gap-2">
				<a href="/" aria-label="Back to feed" title="Back to feed" class="shrink-0 inline-flex items-center gap-1 text-sm {$t.textMuted} {$t.hoverTextSecondary} transition-colors">
					<svg viewBox="0 0 14 14" fill="none" class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg">
						<path d="M9 2L4 7l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
					Feed
				</a>
				<h1 class="flex-1 min-w-0 text-base font-semibold truncate text-center">{setlist?.value.title ?? '…'}</h1>
				<div class="shrink-0">
					{#if isOwn && !loading}
						<button on:click={startEditTitle} aria-label="Edit title" class="{$t.textFaint} {$t.hoverTextSecondary} transition-colors">
							<svg viewBox="0 0 14 14" fill="none" class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg">
								<path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>
							</svg>
						</button>
					{/if}
				</div>
			</div>
		{/if}

		{#if setlist}
			<p class="text-xs {$t.textMuted}">
				{setlist.value.items.length} {setlist.value.items.length === 1 ? 'song' : 'songs'}
				· by @{handle}
				· {timeAgo(setlist.value.createdAt)}
				{#if saving}<span class="{$t.textFaint} ml-1">Saving…</span>{/if}
			</p>
		{/if}

		{#if !loading}
			<div class="flex items-center gap-2 min-h-[28px]">
				<!-- Share button -->
				{#if $authReady && $session}
					<button
						on:click={shareNativeMixtape}
						aria-label="Share mixtape"
						title="Share this mixtape"
						class="flex items-center gap-1.5 text-xs border px-2.5 py-1 rounded-full transition-colors
							{sharePosted
								? `${$t.textPrimary} ${$t.elevatedBg} ${$t.borderStrong}`
								: `${$t.textMuted} ${$t.hoverText} ${$t.borderBase} ${$t.hoverBorderBase}`}"
					>
						{#if sharePosted}
							<svg viewBox="0 0 14 14" fill="none" class="w-3 h-3 shrink-0" xmlns="http://www.w3.org/2000/svg">
								<path d="M2 7l3.5 3.5L12 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
							Copied
						{:else}
							<svg viewBox="0 0 24 24" fill="none" class="w-3 h-3 shrink-0" xmlns="http://www.w3.org/2000/svg">
								<path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M12 3v13.5M7.5 7.5 12 3l4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
							Share
						{/if}
					</button>
				{/if}

				<!-- Add song / Propose a song -->
				{#if isOwn}
					<button
						on:click={() => (addOpen = !addOpen)}
						class="flex items-center gap-1.5 text-xs border px-2.5 py-1 rounded-full transition-colors
							{addOpen ? `${$t.textPrimary} ${$t.elevatedBg} ${$t.borderStrong}` : `${$t.textMuted} ${$t.hoverText} ${$t.borderBase} ${$t.hoverBorderBase}`}"
					>
						<svg viewBox="0 0 14 14" fill="none" class="w-3 h-3 shrink-0 transition-transform {addOpen ? 'rotate-45' : ''}" xmlns="http://www.w3.org/2000/svg">
							<path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
						</svg>
						Add song
					</button>
				{:else if $session}
					<button
						on:click={() => (proposeOpen = !proposeOpen)}
						class="flex items-center gap-1.5 text-xs border px-2.5 py-1 rounded-full transition-colors
							{proposeOpen ? `${$t.textPrimary} ${$t.elevatedBg} ${$t.borderStrong}` : `${$t.textMuted} ${$t.hoverText} ${$t.borderBase} ${$t.hoverBorderBase}`}"
					>
						<svg viewBox="0 0 14 14" fill="none" class="w-3 h-3 shrink-0 transition-transform {proposeOpen ? 'rotate-45' : ''}" xmlns="http://www.w3.org/2000/svg">
							<path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
						</svg>
						Propose a song
					</button>
				{/if}

				<!-- Delete button (owner only), pushed to the right -->
				{#if isOwn}
					<button
						on:click={() => (confirmDeleteOpen = true)}
						aria-label="Delete mixtape"
						title="Permanently delete this mixtape"
						class="ml-auto flex items-center gap-1.5 text-xs border px-2.5 py-1 rounded-full transition-colors
							text-red-400 hover:text-red-300 border-red-900 hover:border-red-700 bg-red-950"
					>
						<svg viewBox="0 0 24 24" fill="none" class="w-3 h-3 shrink-0" xmlns="http://www.w3.org/2000/svg">
							<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						Delete
					</button>
				{/if}
			</div>
		{/if}
	</div>

	{#if addOpen && isOwn}
		<div class="{$t.surfaceBg} border {$t.borderBase} rounded-xl px-4 py-3 space-y-2">
			<div class="relative">
				<input
					type="search"
					bind:value={addQuery}
					placeholder="Search for a song…"
					disabled={addResolving}
					use:focusEl
					class="w-full {$t.elevatedBg} border {$t.borderStrong} rounded-lg pl-8 pr-3 py-2 text-base sm:text-sm {$t.textPrimary}
						placeholder:{$t.textMuted} focus:outline-none {$t.hoverBorderStrong} transition-colors disabled:opacity-50"
				/>
				<span class="absolute left-2.5 top-1/2 -translate-y-1/2 {$t.textMuted} text-sm pointer-events-none">♪</span>
				{#if addSearching || addResolving}
					<span class="absolute right-3 top-1/2 -translate-y-1/2">
						<span class="block w-3.5 h-3.5 border-2 {$t.borderStrong} border-t-white rounded-full animate-spin"></span>
					</span>
				{/if}
			</div>

			{#if addError}
				<p class="text-xs text-red-400">{addError}</p>
			{/if}

			{#if addQuery.trim().length >= 2}
				<div class="rounded-lg border {$t.borderBase} {$t.recessedBg} overflow-hidden max-h-52 overflow-y-auto">
					{#if addSearching && addResults.length === 0}
						<div class="px-4 py-3 space-y-2.5">
							{#each [1, 2, 3] as _}
								<div class="space-y-1.5">
									<div class="h-3.5 w-2/3 {$t.elevatedBg} rounded animate-pulse"></div>
									<div class="h-3 w-1/3 {$t.elevatedBg} rounded animate-pulse"></div>
								</div>
							{/each}
						</div>
					{:else if addResults.length > 0}
						<ul>
							{#each addResults as result}
								{@const alreadyAdded = dndItems.some(
									(d) => d.record?.title === result.title && d.record?.artist === result.artist
								)}
								<li>
									<button
										on:click={() => !alreadyAdded && addSongToSetlist(result)}
										disabled={alreadyAdded || addResolving}
										class="w-full text-left px-4 py-3 border-b {$t.borderBase} last:border-0 transition-colors
											{alreadyAdded ? 'opacity-40 cursor-default' : $t.hoverBg}"
									>
										<p class="text-sm {$t.textPrimary} truncate">{result.title}</p>
										<p class="text-xs {$t.textMuted} truncate">
											{result.artist}{result.album ? ` · ${result.album}` : ''}
										</p>
									</button>
								</li>
							{/each}
						</ul>
					{:else if !addSearching}
						<div class="px-4 py-4 text-center {$t.textMuted} text-sm">No results found.</div>
					{/if}
				</div>
			{/if}

			<label class="flex items-center gap-2 cursor-pointer select-none pt-1">
				<input type="checkbox" bind:checked={addShareToFeed} class="rounded accent-violet-500" />
				<span class="text-xs {$t.textMuted}">Also share to feed</span>
			</label>
		</div>
	{/if}

	<!-- Propose panel (non-owner) -->
	{#if proposeOpen && $session && !isOwn}
		<div class="{$t.surfaceBg} border {$t.borderBase} rounded-xl px-4 py-3 space-y-2">
			{#if proposeSubmitted}
				<div class="py-4 text-center space-y-1">
					<p class="text-sm font-medium {$t.textPrimary}">Proposal submitted!</p>
					<p class="text-xs {$t.textMuted}">The mixtape owner will review your suggestion.</p>
				</div>
			{:else}
				<div class="relative">
					<input
						type="search"
						bind:value={proposeQuery}
						placeholder="Search for a song to propose…"
						disabled={proposeResolving}
						class="w-full {$t.elevatedBg} border {$t.borderStrong} rounded-lg pl-8 pr-3 py-2 text-base sm:text-sm {$t.textPrimary}
							placeholder:{$t.textMuted} focus:outline-none {$t.hoverBorderStrong} transition-colors disabled:opacity-50"
					/>
					<span class="absolute left-2.5 top-1/2 -translate-y-1/2 {$t.textMuted} text-sm pointer-events-none">♪</span>
					{#if proposeSearching || proposeResolving}
						<span class="absolute right-3 top-1/2 -translate-y-1/2">
							<span class="block w-3.5 h-3.5 border-2 {$t.borderStrong} border-t-white rounded-full animate-spin"></span>
						</span>
					{/if}
				</div>

				{#if proposeError}
					<p class="text-xs text-red-400">{proposeError}</p>
				{/if}

				{#if proposeQuery.trim().length >= 2}
					<div class="rounded-lg border {$t.borderBase} {$t.recessedBg} overflow-hidden max-h-52 overflow-y-auto">
						{#if proposeSearching && proposeResults.length === 0}
							<div class="px-4 py-3 space-y-2.5">
								{#each [1, 2, 3] as _}
									<div class="space-y-1.5">
										<div class="h-3.5 w-2/3 {$t.elevatedBg} rounded animate-pulse"></div>
										<div class="h-3 w-1/3 {$t.elevatedBg} rounded animate-pulse"></div>
									</div>
								{/each}
							</div>
						{:else if proposeResults.length > 0}
							<ul>
								{#each proposeResults as result}
									<li>
										<button
											on:click={() => submitProposal(result)}
											disabled={proposeResolving}
											class="w-full text-left px-4 py-3 border-b {$t.borderBase} last:border-0 {$t.hoverBg} transition-colors disabled:opacity-50"
										>
											<p class="text-sm {$t.textPrimary} truncate">{result.title}</p>
											<p class="text-xs {$t.textMuted} truncate">
												{result.artist}{result.album ? ` · ${result.album}` : ''}
											</p>
										</button>
									</li>
								{/each}
							</ul>
						{:else if !proposeSearching}
							<div class="px-4 py-4 text-center {$t.textMuted} text-sm">No results found.</div>
						{/if}
					</div>
				{/if}

				<textarea
					bind:value={proposeNote}
					placeholder="Add a note for the owner… (optional)"
					rows="2"
					maxlength="300"
					disabled={proposeResolving}
					class="w-full {$t.elevatedBg} border {$t.borderStrong} rounded-lg px-3 py-2 text-base sm:text-sm {$t.textPrimary}
						placeholder:{$t.textMuted} focus:outline-none resize-none disabled:opacity-50"
				></textarea>
			{/if}
		</div>
	{/if}

	<!-- Proposals section (owner) -->
	{#if isOwn && !loading && proposals.length > 0}
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<h2 class="text-xs font-semibold {$t.textMuted} uppercase tracking-wider">Proposals</h2>
				{#if proposalsLoading}
					<span class="w-3 h-3 border-2 {$t.borderStrong} border-t-transparent rounded-full animate-spin"></span>
				{:else}
					<span class="text-xs {$t.textFaint}">{proposals.length}</span>
				{/if}
			</div>

			{#each proposals as proposal (proposal.uri)}
				{@const s = proposal.value.snapshot}
				<div class="rounded-xl border {$t.borderBase} {$t.surfaceBg} px-4 py-3 flex items-center gap-3">
					{#if !$instanceConfig.albumArtDisabled && s.thumbnailUrl}
						<img src={thumbUrl(s.thumbnailUrl)} alt="" aria-hidden="true" class="w-10 h-10 rounded-md object-cover shrink-0" />
					{/if}

					<div class="flex-1 min-w-0">
						<p class="text-sm font-semibold {$t.textPrimary} truncate">{s.title}</p>
						<p class="text-xs {$t.textMuted} truncate">{s.artist}{s.album ? ` · ${s.album}` : ''}</p>
						<p class="text-xs {$t.textFaint} truncate mt-0.5">
							proposed by @{proposal.proposerHandle ?? proposal.proposerDid}
							{#if proposal.value.note}· "{proposal.value.note}"{/if}
						</p>
					</div>

					<div class="flex items-center gap-1.5 shrink-0">
						<button
							on:click={() => acceptProposal(proposal)}
							disabled={!!acceptingUri}
							class="text-xs font-medium px-3 py-1.5 rounded-full {$t.btnPrimaryBg} {$t.btnPrimaryText} {$t.btnPrimaryHover} transition-colors disabled:opacity-40"
						>
							{#if acceptingUri === proposal.uri}
								<span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
							{:else}
								Accept
							{/if}
						</button>
						<button
							on:click={() => dismissProposal(proposal.uri)}
							aria-label="Dismiss proposal"
							title="Hide this proposal"
							class="flex items-center gap-1.5 text-xs border px-2.5 py-1 rounded-full transition-colors
								{$t.textFaint} {$t.borderBase} {$t.hoverTextSecondary} {$t.hoverBorderBase}"
						>
							<svg viewBox="0 0 14 14" fill="none" class="w-3 h-3 shrink-0" xmlns="http://www.w3.org/2000/svg">
								<path d="M2 2l10 10M12 2 2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
							</svg>
							Dismiss
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if loading}
		<p class="{$t.textMuted} text-sm">Loading…</p>
	{:else if error}
		<p class="text-red-400 text-sm">{error}</p>
	{:else if dndItems.length === 0}
		<div class="rounded-xl border {$t.borderBase} {$t.surfaceBg} px-5 py-10 text-center space-y-2">
			<p class="{$t.textSecondary} text-sm font-medium">This mixtape is empty</p>
			<p class="{$t.textMuted} text-xs">Select songs in the Feed tab and add them to a mixtape.</p>
		</div>
	{:else}
		{#if isOwn}
			<div class="flex items-center gap-3 -mt-3">
				<label class="flex items-center gap-2 cursor-pointer select-none">
					<button
						role="switch"
						aria-checked={editMode}
						aria-label="Edit mode"
						on:click={() => (editMode = !editMode)}
						class="relative w-8 h-4.5 rounded-full transition-colors duration-200 focus-visible:outline-none
							{editMode ? 'bg-violet-600' : $t.elevatedBg} border {editMode ? 'border-violet-500' : $t.borderStrong}"
						style="height:18px;width:32px;"
					>
						<span
							class="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all duration-200"
							style="left: {editMode ? '15px' : '2px'};"
						></span>
					</button>
					<span class="text-xs {editMode ? $t.textSecondary : $t.textFaint}">Edit</span>
				</label>
				{#if editMode && dndItems.length > 1}
					<span class="text-xs {$t.textFaint} flex items-center gap-1.5">
						<svg viewBox="0 0 14 14" fill="none" class="w-3 h-3 shrink-0" xmlns="http://www.w3.org/2000/svg">
							<path d="M2 4h10M2 7h10M2 10h10" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
						</svg>
						Drag to reorder
					</span>
				{/if}
			</div>
		{/if}

		<div
			use:dndzone={{ items: dndItems, flipDurationMs: 150, dragDisabled: !isOwn || !editMode }}
			on:consider={handleDndConsider}
			on:finalize={handleDndFinalize}
		>
			{#each dndItems as dndItem (dndItem.id)}
				{@const primaryPlatform = dndItem.record ? getPrimaryPlatform(dndItem.record) : null}
				<div animate:flip={{ duration: 150 }}
					class="relative border-b {$t.borderBase} sm:rounded-xl sm:border sm:mb-2 pl-4 py-3
						{primaryPlatform ? 'pr-16' : 'pr-4'}
						{isOwn && editMode ? 'cursor-grab active:cursor-grabbing' : ''}"
				>
					<!-- Row 1: drag handle + art + title/artist + remove -->
					<div class="flex items-center gap-3">
						{#if isOwn && editMode}
							<svg viewBox="0 0 14 14" fill="none" class="w-4 h-4 {$t.textFaint} shrink-0" xmlns="http://www.w3.org/2000/svg">
								<path d="M2 4h10M2 7h10M2 10h10" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
							</svg>
						{/if}

						{#if !$instanceConfig.albumArtDisabled && dndItem.record?.thumbnailUrl}
							<img src={thumbUrl(dndItem.record?.thumbnailUrl)} alt="" aria-hidden="true" class="w-10 h-10 rounded-md object-cover shrink-0" />
						{/if}

						<div class="flex-1 min-w-0">
							{#if dndItem.record}
								<p class="text-sm font-semibold {$t.textPrimary} truncate">{dndItem.record.title}</p>
								<p class="text-xs {$t.textMuted} truncate">{dndItem.record.artist}</p>
							{:else}
								<p class="text-sm {$t.textMuted} truncate">{dndItem.id}</p>
							{/if}
						</div>

						{#if isOwn && editMode}
							<button
								on:click={() => removeItem(dndItem.id)}
								aria-label="Remove from mixtape"
								title="Remove this song from the mixtape"
								class="flex items-center justify-center w-7 h-7 rounded-full border {$t.borderBase} {$t.textFaint} hover:text-red-400 hover:border-red-900 transition-colors shrink-0"
							>
								<svg viewBox="0 0 14 14" fill="none" class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg">
									<path d="M2 2l10 10M12 2 2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
								</svg>
							</button>
						{/if}
					</div>

					<!-- Floating play button -->
					{#if primaryPlatform && !editMode}
						<a
							href={dndItem.record?.[primaryPlatform.key] as string}
							title="Listen on {primaryPlatform.label}"
							class="absolute right-4 inset-y-0 flex items-center z-10"
						>
							<div
								class="w-10 h-10 rounded-full flex items-center justify-center shadow-md transition-opacity hover:opacity-80"
								style="background-color: {primaryPlatform.color}"
							>
								<svg viewBox="0 0 10 10" fill="white" class="w-4 h-4 ml-0.5" xmlns="http://www.w3.org/2000/svg">
									<path d="M2 1.5l6 3.5-6 3.5V1.5Z"/>
								</svg>
							</div>
						</a>
					{/if}

					<!-- Row 2: actions (matches feed card order) -->
					{#if dndItem.record}
						{@const uri = dndItem.id}
						{@const rec = dndItem.record}
						{@const liked = likedUris.has(uri)}
						{@const count = voteCounts.get(uri) ?? 0}
						<div class="flex items-center gap-6 mt-2 overflow-x-auto">
							<!-- song.link -->
							{#if rec.songlinkUrl}
								<a href={rec.songlinkUrl} target="_blank" rel="noopener noreferrer"
									title="Open on song.link — see all available platforms"
									class="p-2 transition-colors {$t.textFaint} {$t.hoverTextSecondary}">
									<svg viewBox="0 0 24 24" fill="none" class="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
										<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
										<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
									</svg>
								</a>
							{/if}
							<!-- Share song -->
							{#if $session && rec.songlinkUrl}
								<button on:click={() => shareNativeSong(uri, rec)}
									aria-label="Share song"
									title="Share this song"
									class="p-2 transition-colors {songShared.has(uri) ? $t.textPrimary : `${$t.textFaint} ${$t.hoverTextSecondary}`}">
									{#if songShared.has(uri)}
										<svg viewBox="0 0 14 14" fill="none" class="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
											<path d="M2 7l3.5 3.5L12 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
										</svg>
									{:else}
										<svg viewBox="0 0 24 24" fill="none" class="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
											<path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M12 3v13.5M7.5 7.5 12 3l4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
										</svg>
									{/if}
								</button>
							{/if}
							<!-- Upnote -->
							{#if $session}
							<button on:click={() => toggleSongLike(uri, dndItem.item.songCid)}
								disabled={liking.has(uri)}
								aria-label={liked ? 'Unlike' : 'Upnote'}
								title={liked ? 'Remove your upnote' : 'Upnote this song'}
								class="p-2 flex items-center gap-1.5 transition-colors disabled:opacity-50 {liked ? $t.accentText : `${$t.textFaint} ${$t.hoverTextSecondary}`}">
								{#if liking.has(uri)}
									<span class="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block"></span>
								{:else}
									<span class="flex items-center gap-0.5">
										<svg viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} class="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
											<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
										</svg>
										<span class="text-base leading-none -mt-0.5">♪</span>
									</span>
									{#if count > 0}<span class="text-sm tabular-nums">{count}</span>{/if}
								{/if}
							</button>
							{/if}
							<!-- Resync (owner only) -->
							{#if isOwn && rec.appleMusicUrl}
								<button on:click={() => resyncSong(dndItem)}
									disabled={resyncing.has(uri)}
									aria-label="Resync song metadata"
									title="Re-fetch metadata and platform links from streaming services"
									class="p-2 transition-colors disabled:opacity-50 {resynced.has(uri) ? $t.textPrimary : resyncErrors.has(uri) ? 'text-red-400' : `${$t.textFaint} ${$t.hoverTextSecondary}`}">
									{#if resyncing.has(uri)}
										<span class="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block"></span>
									{:else if resynced.has(uri)}
										<svg viewBox="0 0 14 14" fill="none" class="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
											<path d="M2 7l3.5 3.5L12 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
										</svg>
									{:else}
										<svg viewBox="0 0 24 24" fill="none" class="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
											<path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
										</svg>
									{/if}
								</button>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Join CTA for unauthenticated visitors -->
	{#if $authReady && !$session && !loading && !error}
		<div class="rounded-xl border {$t.borderBase} {$t.surfaceBg} px-5 py-8 text-center space-y-3 mt-2">
			<p class="text-sm font-semibold {$t.textPrimary}">Join {APP_NAME} to share music</p>
			<p class="text-xs {$t.textMuted}">Share songs across Spotify, Apple Music, Tidal, and more. Build mixtapes with friends.</p>
			<a href="/login" class="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium {$t.btnPrimaryBg} {$t.btnPrimaryText} {$t.btnPrimaryHover} transition-colors">
				Sign in to join
			</a>
		</div>
	{/if}

	<!-- DEV ONLY: seed a test proposal from your own session so you can see the owner proposals UI -->
	{#if import.meta.env.DEV && isOwn && setlist && $session}
		<div class="mt-8 pt-6 border-t {$t.borderBase}">
			<p class="text-xs {$t.textFaint} mb-2">Dev tools</p>
			<button
				on:click={async () => {
					try {
						await createProposal(
							$session!.did,
							setlist!.uri,
							setlist!.cid,
							{
								title: 'Bohemian Rhapsody',
								artist: 'Queen',
								album: 'A Night at the Opera',
								spotifyUrl: 'https://open.spotify.com/track/3z8h0TU7ReDPLIbEnYhWZb',
								songlinkUrl: 'https://song.link/s/1e3NUB3VEI6nFzWxHIY5FY'
							},
							'Great song for this setlist!'
						);
						await loadProposals();
					} catch (e) {
						alert(e instanceof Error ? e.message : 'Seed failed');
					}
				}}
				class="text-xs {$t.textMuted} border {$t.borderBase} px-3 py-1.5 rounded-lg {$t.hoverBg} transition-colors"
			>
				+ Seed test proposal
			</button>
		</div>
	{/if}
</section>
