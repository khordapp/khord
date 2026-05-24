export function slugify(text: string): string {
	return text
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
}

export function songSlug(title: string, artist: string, id: number): string {
	return `${slugify(`${title} ${artist}`)}-${id}`;
}

export function setlistSlug(title: string, id: number): string {
	return `${slugify(title)}-${id}`;
}

export function parseSlugId(slug: string): number | null {
	const m = slug.match(/-(\d+)$/);
	if (m) return parseInt(m[1], 10);
	if (/^\d+$/.test(slug)) return parseInt(slug, 10);
	return null;
}
