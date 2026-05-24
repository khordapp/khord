// Server-side disk cache for album art thumbnails.
// Cache dir is configurable via THUMBNAIL_CACHE_DIR (default: /data/thumbnails).
// Keys are SHA-256 hashes of the source URL — no sidecar files needed.
// Content-type is detected from magic bytes on read.

import { createHash } from 'crypto';
import { mkdirSync, existsSync, readdirSync, statSync, unlinkSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { env } from '$env/dynamic/private';

function getCacheDir(): string {
	return env.THUMBNAIL_CACHE_DIR ?? '/data/thumbnails';
}

function urlToKey(url: string): string {
	return createHash('sha256').update(url).digest('hex').slice(0, 32);
}

function detectContentType(buf: Buffer): string {
	if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
	if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
	if (buf.length >= 12 && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
	if (buf.length >= 4 && buf.subarray(0, 4).toString('ascii').startsWith('GIF8')) return 'image/gif';
	return 'image/jpeg';
}

export function getFromCache(url: string): { buffer: Buffer; contentType: string } | null {
	const dir = getCacheDir();
	const filePath = join(dir, urlToKey(url));
	if (!existsSync(filePath)) return null;
	try {
		const buffer = Buffer.from(readFileSync(filePath));
		return { buffer, contentType: detectContentType(buffer) };
	} catch {
		return null;
	}
}

export function saveToCache(url: string, buffer: Buffer): void {
	const dir = getCacheDir();
	try {
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, urlToKey(url)), buffer);
	} catch (e) {
		console.error('[thumbnailCache] write failed:', e);
	}
}

export interface CacheStats {
	count: number;
	totalBytes: number;
	oldestMtime: string | null; // ISO string
}

export function getCacheStats(): CacheStats {
	const dir = getCacheDir();
	if (!existsSync(dir)) return { count: 0, totalBytes: 0, oldestMtime: null };
	try {
		const entries = readdirSync(dir);
		let count = 0;
		let totalBytes = 0;
		let oldestMtime: Date | null = null;
		for (const name of entries) {
			const st = statSync(join(dir, name));
			if (!st.isFile()) continue;
			count++;
			totalBytes += st.size;
			if (!oldestMtime || st.mtime < oldestMtime) oldestMtime = st.mtime;
		}
		return { count, totalBytes, oldestMtime: oldestMtime?.toISOString() ?? null };
	} catch {
		return { count: 0, totalBytes: 0, oldestMtime: null };
	}
}

export interface PruneResult {
	count: number;
	bytesFreed: number;
}

export function pruneOrphanThumbnails(activeThumbnailUrls: string[]): PruneResult {
	const dir = getCacheDir();
	if (!existsSync(dir)) return { count: 0, bytesFreed: 0 };
	const validKeys = new Set(activeThumbnailUrls.filter(Boolean).map(urlToKey));
	try {
		const entries = readdirSync(dir);
		let count = 0;
		let bytesFreed = 0;
		for (const name of entries) {
			const filePath = join(dir, name);
			const st = statSync(filePath);
			if (!st.isFile()) continue;
			if (!validKeys.has(name)) {
				bytesFreed += st.size;
				unlinkSync(filePath);
				count++;
			}
		}
		return { count, bytesFreed };
	} catch {
		return { count: 0, bytesFreed: 0 };
	}
}

export function pruneCache(olderThanDays: number): PruneResult {
	const dir = getCacheDir();
	if (!existsSync(dir)) return { count: 0, bytesFreed: 0 };
	// olderThanDays === 0 means delete everything
	const cutoff =
		olderThanDays === 0
			? new Date(Date.now() + 1000)
			: new Date(Date.now() - olderThanDays * 86_400_000);
	try {
		const entries = readdirSync(dir);
		let count = 0;
		let bytesFreed = 0;
		for (const name of entries) {
			const filePath = join(dir, name);
			const st = statSync(filePath);
			if (!st.isFile()) continue;
			if (st.mtime < cutoff) {
				bytesFreed += st.size;
				unlinkSync(filePath);
				count++;
			}
		}
		return { count, bytesFreed };
	} catch {
		return { count: 0, bytesFreed: 0 };
	}
}
