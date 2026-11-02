import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReminderScheduler, ShareCalendarStore } from "../../electron/shareCalendarStore";
import {
	dayKey,
	dueReminders,
	fromLocalInput,
	MISSED_GRACE,
	markDueSent,
	monthGrid,
	nextReminderAt,
	normalizeSharePost,
	reminderNotice,
	toLocalInput,
} from "./shareCalendar";

const HOUR = 3_600_000,
	DAY = 24 * HOUR,
	start = new Date(2026, 10, 1, 9, 0).getTime();
const post = (over: Record<string, unknown> = {}, now = start) =>
	normalizeSharePost(
		{
			id: "post-1",
			creationId: "creation-1",
			title: "Kasım kampanyası",
			scheduledAt: start + 9 * DAY,
			platforms: ["linkedin"],
			caption: "Yeni ürün",
			reminders: [1440, 0],
			...over,
		},
		now,
	);
const roots: string[] = [];
afterEach(async () => {
	vi.useRealTimers();
	await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});
async function tempFile() {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "share-calendar-test-"));
	roots.push(root);
	return path.join(root, "share-calendar.json");
}

describe("share calendar entries", () => {
	it("validates input and drops unknown platforms and reminder offsets", () => {
		const p = post({ platforms: ["linkedin", "myspace"], reminders: [1440, 7, 0], caption: 5 });
		expect(p.platforms).toEqual(["linkedin"]);
		expect(p.reminders).toEqual([1440, 0]);
		expect(p.caption).toBe("");
		expect(() => post({ scheduledAt: "yarın" })).toThrow("Geçerli bir tarih");
		expect(() => post({ creationId: "" })).toThrow();
		expect(post({ thumbnail: "javascript:alert(1)" }).thumbnail).toBeUndefined();
	});
	it("does not fire reminders that were already in the past when saved", () => {
		const soon = post({ scheduledAt: start + 2 * HOUR });
		expect(soon.sentReminders).toEqual([1440]);
		expect(dueReminders([soon], start)).toEqual([]);
		expect(nextReminderAt([soon], start)).toBe(start + 2 * HOUR);
	});
	it("fires one day before and at the time, then nothing more", () => {
		let posts = [post()];
		expect(nextReminderAt(posts, start)).toBe(start + 8 * DAY);
		const dayBefore = start + 8 * DAY;
		expect(dueReminders(posts, dayBefore - 1)).toEqual([]);
		expect(dueReminders(posts, dayBefore).map((d) => d.minutes)).toEqual([1440]);
		posts = markDueSent(posts, dayBefore);
		expect(dueReminders(posts, dayBefore + HOUR)).toEqual([]);
		expect(nextReminderAt(posts, dayBefore)).toBe(start + 9 * DAY);
		posts = markDueSent(posts, start + 9 * DAY);
		expect(nextReminderAt(posts, start + 9 * DAY)).toBeUndefined();
	});
	it("reports only the latest reminder after the app was closed, as missed", () => {
		const later = start + 10 * DAY,
			due = dueReminders([post()], later);
		expect(due.map((d) => d.minutes)).toEqual([0]);
		expect(reminderNotice(due, later).title).toBe("Kaçırılan 1 paylaşım hatırlatması");
		expect(reminderNotice(due, due[0].at + MISSED_GRACE).title).toContain("Paylaşım zamanı geldi");
	});
	it("stops reminding once the entry is marked shared", () => {
		const shared = post({ status: "shared" });
		expect(shared.sharedAt).toBe(start);
		expect(dueReminders([shared], start + 10 * DAY)).toEqual([]);
		expect(nextReminderAt([shared], start)).toBeUndefined();
	});
	it("builds a Monday-first month grid and local date keys", () => {
		const grid = monthGrid(2026, 10);
		expect(grid).toHaveLength(42);
		expect(grid[0].getDay()).toBe(1);
		expect(dayKey(grid[6])).toBe("2026-11-01");
		expect(dayKey(new Date(2026, 10, 10, 23, 59))).toBe("2026-11-10");
		expect(fromLocalInput(toLocalInput(start))).toBe(start);
		expect(fromLocalInput("bozuk")).toBeNaN();
	});
});

describe("main-process store and scheduler", () => {
	it("persists entries, edits and deletions", async () => {
		const file = await tempFile(),
			store = new ShareCalendarStore(file, () => start);
		await Promise.all([store.save(post()), store.save(post({ id: "post-2" }))]);
		await store.save(post({ caption: "Düzenlendi" }));
		const reopened = new ShareCalendarStore(file, () => start);
		expect((await reopened.list()).map((p) => [p.id, p.caption])).toEqual([
			["post-1", "Düzenlendi"],
			["post-2", "Yeni ürün"],
		]);
		expect(await reopened.remove("post-1")).toBe(true);
		expect((await reopened.list()).map((p) => p.id)).toEqual(["post-2"]);
	});
	it("notifies with a fake clock, including after sleep, and never twice", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(start);
		const store = new ShareCalendarStore(await tempFile()),
			notices: string[][] = [];
		await store.save(post({ scheduledAt: start + 2 * DAY, reminders: [1440, 60, 0] }));
		const scheduler = new ReminderScheduler(store, (due) =>
			notices.push(due.map((d) => `${d.post.id}:${d.minutes}`)),
		);
		// Follow the scheduler's own timers on the fake clock until the given moment.
		const runUntil = async (until: number) => {
			while (scheduler.wakeAt !== undefined && scheduler.wakeAt <= until) {
				vi.advanceTimersByTime(scheduler.wakeAt - Date.now());
				await scheduler.idle();
			}
		};
		await scheduler.check();
		expect(notices).toEqual([]);
		expect(scheduler.wakeAt).toBe(start + HOUR);
		await runUntil(start + DAY - 1);
		expect(notices).toEqual([]);
		await runUntil(start + DAY);
		expect(notices).toEqual([["post-1:1440"]]);
		// Laptop sleeps through the one-hour reminder and wakes after the scheduled time.
		vi.setSystemTime(start + 2 * DAY + 10 * 60_000);
		await scheduler.check();
		expect(notices).toEqual([["post-1:1440"], ["post-1:0"]]);
		expect(
			reminderNotice([{ post: post(), minutes: 0, at: start + 2 * DAY }], Date.now()).title,
		).toContain("Kaçırılan");
		await runUntil(start + 5 * DAY);
		expect(notices).toHaveLength(2);
		scheduler.stop();
	});
});
