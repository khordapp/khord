import { writable, get } from 'svelte/store';

// songs: songId → voteRowId, setlists: setlistId → voteRowId
interface VotesState {
	songs:    Map<number, number>;
	setlists: Map<number, number>;
}

const _state = writable<VotesState>({ songs: new Map(), setlists: new Map() });

export const votes = {
	subscribe: _state.subscribe,

	async load() {
		const res = await fetch('/api/votes/mine');
		if (!res.ok) return;
		const { songs, setlists } = await res.json();
		_state.set({
			songs:    new Map(Object.entries(songs).map(([k, v]) => [Number(k), v as number])),
			setlists: new Map(Object.entries(setlists).map(([k, v]) => [Number(k), v as number])),
		});
	},

	async like(songId: number): Promise<void> {
		const res = await fetch('/api/votes', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ songId })
		});
		if (!res.ok) throw new Error('Vote failed');
		const { id } = await res.json();
		_state.update((s) => ({ ...s, songs: new Map(s.songs).set(songId, id) }));
	},

	async unlike(songId: number): Promise<void> {
		const voteId = get(_state).songs.get(songId);
		if (!voteId) return;
		const res = await fetch(`/api/votes/${voteId}`, { method: 'DELETE' });
		if (!res.ok && res.status !== 404) throw new Error('Unlike failed');
		_state.update((s) => {
			const songs = new Map(s.songs);
			songs.delete(songId);
			return { ...s, songs };
		});
	},

	async likeSetlist(setlistId: number): Promise<void> {
		const res = await fetch('/api/votes', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ setlistId })
		});
		if (!res.ok) throw new Error('Vote failed');
		const { id } = await res.json();
		_state.update((s) => ({ ...s, setlists: new Map(s.setlists).set(setlistId, id) }));
	},

	async unlikeSetlist(setlistId: number): Promise<void> {
		const voteId = get(_state).setlists.get(setlistId);
		if (!voteId) return;
		const res = await fetch(`/api/votes/${voteId}`, { method: 'DELETE' });
		if (!res.ok && res.status !== 404) throw new Error('Unlike failed');
		_state.update((s) => {
			const setlists = new Map(s.setlists);
			setlists.delete(setlistId);
			return { ...s, setlists };
		});
	},

	reset() {
		_state.set({ songs: new Map(), setlists: new Map() });
	}
};
