import fs from "node:fs/promises";
import path from "node:path";
import {
	type DueReminder,
	dueReminders,
	markDueSent,
	nextReminderAt,
	normalizeSharePost,
	type SharePost,
} from "../src/lib/shareCalendar";
import { atomicWrite } from "./projectLibrary";

/** Durable share calendar kept by the main process so reminders work without an open window. */
export class ShareCalendarStore {
	private pending: Promise<unknown> = Promise.resolve();

	constructor(
		private readonly filePath: string,
		private readonly now: () => number = Date.now,
	) {}

	async list(): Promise<SharePost[]> {
		try {
			const raw = JSON.parse(await fs.readFile(this.filePath, "utf8"));
			if (!Array.isArray(raw?.posts)) return [];
			const posts: SharePost[] = [];
			for (const item of raw.posts) {
				try {
					// Disk entries keep their own update time and reminder state.
					const post = normalizeSharePost(item, this.now());
					post.updatedAt = Number(item.updatedAt) || post.updatedAt;
					post.sentReminders = post.reminders.filter(
						(m) => Array.isArray(item.sentReminders) && item.sentReminders.includes(m),
					);
					posts.push(post);
				} catch {
					// Skip damaged entries instead of losing the whole calendar.
				}
			}
			return posts.sort((a, b) => a.scheduledAt - b.scheduledAt || a.id.localeCompare(b.id));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw error;
		}
	}

	/** Serializes read-modify-write cycles so concurrent saves never drop each other. */
	private update<T>(change: (posts: SharePost[]) => { posts: SharePost[]; result: T }): Promise<T> {
		const run = this.pending.then(async () => {
			const { posts, result } = change(await this.list());
			await fs.mkdir(path.dirname(this.filePath), { recursive: true });
			await atomicWrite(this.filePath, JSON.stringify({ version: 1, posts }, null, 2));
			return result;
		});
		this.pending = run.catch(() => undefined);
		return run;
	}

	save(raw: unknown) {
		const post = normalizeSharePost(raw, this.now());
		return this.update((posts) => {
			const old = posts.find((p) => p.id === post.id);
			if (old) post.createdAt = old.createdAt;
			return { posts: [...posts.filter((p) => p.id !== post.id), post], result: post };
		});
	}

	remove(id: string) {
		return this.update((posts) => ({
			posts: posts.filter((p) => p.id !== id),
			result: posts.some((p) => p.id === id),
		}));
	}

	/** Returns the reminders that are due now and records them as sent. */
	takeDue(): Promise<DueReminder[]> {
		const now = this.now();
		return this.update((posts) => ({
			posts: markDueSent(posts, now),
			result: dueReminders(posts, now),
		}));
	}
}

/** Longest single wait; also bounds drift after clock changes the OS does not report. */
const MAX_WAIT = 60 * 60_000;

/** Wakes up for the next reminder; `check()` should also run after sleep or clock changes. */
export class ReminderScheduler {
	private timer: ReturnType<typeof setTimeout> | undefined;
	private running: Promise<void> | undefined;
	private again = false;
	/** When the scheduler will look again; exposed for tests. */
	wakeAt: number | undefined;

	constructor(
		private readonly store: ShareCalendarStore,
		private readonly notify: (due: DueReminder[]) => void,
		private readonly now: () => number = Date.now,
		private readonly onError: (error: unknown) => void = console.error,
	) {}

	check(): Promise<void> {
		if (this.running) {
			this.again = true;
			return this.running;
		}
		this.running = (async () => {
			do {
				this.again = false;
				try {
					const due = await this.store.takeDue();
					if (due.length) this.notify(due);
					this.arm(nextReminderAt(await this.store.list(), this.now()));
				} catch (error) {
					this.onError(error);
					this.arm(undefined);
				}
			} while (this.again);
		})().finally(() => {
			this.running = undefined;
		});
		return this.running;
	}

	private arm(next: number | undefined) {
		clearTimeout(this.timer);
		const wait = next === undefined ? MAX_WAIT : Math.min(MAX_WAIT, Math.max(0, next - this.now()));
		this.wakeAt = this.now() + wait;
		this.timer = setTimeout(() => void this.check(), wait);
		this.timer.unref?.();
	}

	idle(): Promise<void> {
		return this.running ?? Promise.resolve();
	}

	stop() {
		clearTimeout(this.timer);
		this.timer = undefined;
	}
}
