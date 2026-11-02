// Share calendar entries shared by the Creative Studio "Plan" tab (renderer) and the reminder
// scheduler (main process). Pure functions only: no Electron, DOM or IndexedDB access here.

export const SHARE_PLATFORMS = [
	{ id: "linkedin", label: "LinkedIn", url: "https://www.linkedin.com/feed/?shareActive=true" },
	{ id: "instagram", label: "Instagram", url: "https://www.instagram.com/" },
	{ id: "x", label: "X", url: "https://x.com/compose/post" },
	{ id: "facebook", label: "Facebook", url: "https://www.facebook.com/" },
	{ id: "tiktok", label: "TikTok", url: "https://www.tiktok.com/upload" },
] as const;
export type SharePlatform = (typeof SHARE_PLATFORMS)[number]["id"];

/** Minutes before the scheduled time. 0 means "when it is time". */
export const REMINDER_OPTIONS = [
	{ minutes: 1440, label: "1 gün önce" },
	{ minutes: 60, label: "1 saat önce" },
	{ minutes: 15, label: "15 dk önce" },
	{ minutes: 0, label: "Tam zamanında" },
] as const;
export const DEFAULT_REMINDERS = [1440, 0];

export type SharePost = {
	id: string;
	creationId: string;
	/** Short label for notifications, which cannot read the gallery. */
	title: string;
	/** Small data URL preview for notifications and the calendar grid. */
	thumbnail?: string;
	scheduledAt: number;
	platforms: SharePlatform[];
	caption: string;
	reminders: number[];
	/** Reminder offsets already shown, or already in the past when the entry was saved. */
	sentReminders: number[];
	status: "planned" | "shared";
	sharedAt?: number;
	createdAt: number;
	updatedAt: number;
};

const MAX_THUMBNAIL = 300_000;
const MINUTE = 60_000;
/** A reminder shown later than this is reported as missed rather than as a live reminder. */
export const MISSED_GRACE = 5 * MINUTE;

export const reminderTime = (post: Pick<SharePost, "scheduledAt">, minutes: number) =>
	post.scheduledAt - minutes * MINUTE;

/** Validates untrusted input (IPC or disk) and marks reminders that are already in the past. */
export function normalizeSharePost(raw: unknown, now: number): SharePost {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("Geçersiz takvim kaydı.");
	const x = raw as Record<string, unknown>;
	const text = (value: unknown, max: number) =>
		typeof value === "string" ? value.slice(0, max) : "";
	const id = text(x.id, 100),
		creationId = text(x.creationId, 100);
	if (!id || !creationId) throw Error("Takvim kaydında görsel bilgisi eksik.");
	const scheduledAt = Number(x.scheduledAt);
	if (!Number.isFinite(scheduledAt) || scheduledAt <= 0)
		throw Error("Geçerli bir tarih ve saat seç.");
	const platforms = SHARE_PLATFORMS.map((p) => p.id).filter(
		(p) => Array.isArray(x.platforms) && x.platforms.includes(p),
	);
	const reminders = REMINDER_OPTIONS.map((r) => r.minutes).filter(
		(m) => Array.isArray(x.reminders) && x.reminders.includes(m),
	);
	const status = x.status === "shared" ? "shared" : "planned";
	const thumbnail =
		typeof x.thumbnail === "string" &&
		x.thumbnail.length <= MAX_THUMBNAIL &&
		/^data:image\/(png|jpeg|webp);base64,/.test(x.thumbnail)
			? x.thumbnail
			: undefined;
	const post: SharePost = {
		id,
		creationId,
		title: text(x.title, 200) || "Görsel",
		scheduledAt,
		platforms,
		caption: text(x.caption, 5000),
		reminders,
		sentReminders: reminders.filter((m) => reminderTime({ scheduledAt }, m) <= now),
		status,
		createdAt: Number.isFinite(Number(x.createdAt)) ? Number(x.createdAt) : now,
		updatedAt: now,
	};
	if (thumbnail) post.thumbnail = thumbnail;
	if (status === "shared")
		post.sharedAt = Number.isFinite(Number(x.sharedAt)) ? Number(x.sharedAt) : now;
	return post;
}

export type DueReminder = { post: SharePost; minutes: number; at: number };

/**
 * Reminders whose time has come. When several reminders of one entry are due at once (the app was
 * closed or the computer slept) only the latest one is reported; the rest are simply marked sent.
 */
export function dueReminders(posts: SharePost[], now: number): DueReminder[] {
	const due: DueReminder[] = [];
	for (const post of posts) {
		if (post.status !== "planned") continue;
		const pending = post.reminders
			.filter((m) => !post.sentReminders.includes(m) && reminderTime(post, m) <= now)
			.sort((a, b) => a - b);
		if (pending.length) due.push({ post, minutes: pending[0], at: reminderTime(post, pending[0]) });
	}
	return due.sort((a, b) => a.at - b.at);
}

/** Copies the posts with every reminder that is due by `now` marked as sent. */
export function markDueSent(posts: SharePost[], now: number): SharePost[] {
	return posts.map((post) => {
		if (post.status !== "planned") return post;
		const sent = post.reminders.filter(
			(m) => post.sentReminders.includes(m) || reminderTime(post, m) <= now,
		);
		return sent.length === post.sentReminders.length ? post : { ...post, sentReminders: sent };
	});
}

export function nextReminderAt(posts: SharePost[], now: number): number | undefined {
	let next: number | undefined;
	for (const post of posts) {
		if (post.status !== "planned") continue;
		for (const m of post.reminders) {
			const at = reminderTime(post, m);
			if (!post.sentReminders.includes(m) && at > now && (next === undefined || at < next))
				next = at;
		}
	}
	return next;
}

const platformNames = (post: SharePost) =>
	post.platforms.map((p) => SHARE_PLATFORMS.find((x) => x.id === p)?.label || p).join(", ") ||
	"Paylaşım";

export function formatShareTime(at: number) {
	return new Date(at).toLocaleString("tr-TR", {
		day: "numeric",
		month: "long",
		weekday: "long",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/** Notification text for due reminders: one entry gets its own message, several get a summary. */
export function reminderNotice(due: DueReminder[], now: number): { title: string; body: string } {
	if (due.length === 1 && now - due[0].at <= MISSED_GRACE) {
		const { post, minutes } = due[0];
		const when =
			minutes === 0
				? "Paylaşım zamanı geldi"
				: `${REMINDER_OPTIONS.find((r) => r.minutes === minutes)?.label.replace(" önce", "") || ""} sonra paylaşım`;
		return {
			title: `${when} · ${platformNames(post)}`,
			body: `${post.title} — ${formatShareTime(post.scheduledAt)}`,
		};
	}
	const missed = due.some((d) => now - d.at > MISSED_GRACE);
	return {
		title: missed
			? `Kaçırılan ${due.length} paylaşım hatırlatması`
			: `${due.length} paylaşım hatırlatması`,
		body: due
			.slice(0, 3)
			.map((d) => `${platformNames(d.post)}: ${d.post.title}`)
			.join("\n"),
	};
}

export const isOverdue = (post: SharePost, now: number) =>
	post.status === "planned" && post.scheduledAt <= now;

/** Local calendar day, used to place entries into the month grid. */
export function dayKey(at: number | Date) {
	const d = new Date(at);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Six Monday-first weeks covering the given month (month is 0-based). */
export function monthGrid(year: number, month: number): Date[] {
	const first = new Date(year, month, 1),
		offset = (first.getDay() + 6) % 7;
	return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - offset + i));
}

/** `datetime-local` value in local time, and back. */
export function toLocalInput(at: number) {
	const d = new Date(at);
	return `${dayKey(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export function fromLocalInput(value: string) {
	const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
	if (!match) return Number.NaN;
	const [, y, mo, d, h, mi] = match.map(Number);
	return new Date(y, mo - 1, d, h, mi).getTime();
}
