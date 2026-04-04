export const SETLIST_NSID = 'app.khord.setlist';

export interface KhordSetlistItem {
	songUri: string;
	songCid: string;
	addedBy: string;
	addedAt: string;
}

export interface KhordSetlistRecord {
	title: string;
	description?: string;
	items: KhordSetlistItem[];
	collaborators?: string[];
	open?: boolean;
	createdAt: string;
}

export interface KhordSetlist {
	uri: string;
	cid: string;
	value: KhordSetlistRecord;
}
