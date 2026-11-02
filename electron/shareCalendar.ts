import path from "node:path";
import { app, clipboard, ipcMain, Notification, nativeImage, powerMonitor } from "electron";
import { type DueReminder, reminderNotice } from "../src/lib/shareCalendar";
import { ReminderScheduler, ShareCalendarStore } from "./shareCalendarStore";

let store: ShareCalendarStore | undefined;
let scheduler: ReminderScheduler | undefined;
let pendingOpen: { postId?: string } | undefined;
// Electron drops click handlers of notifications that get garbage collected.
const shown = new Set<Notification>();
const MAX_IMAGE = 60 * 1024 * 1024;

function calendar() {
	if (!store)
		store = new ShareCalendarStore(path.join(app.getPath("userData"), "share-calendar.json"));
	return store;
}

function notify(due: DueReminder[], openPlan: () => void) {
	if (!Notification.isSupported()) return;
	const { title, body } = reminderNotice(due, Date.now()),
		single = due.length === 1 ? due[0].post : undefined,
		icon = single?.thumbnail ? nativeImage.createFromDataURL(single.thumbnail) : undefined;
	const notification = new Notification({
		title,
		body,
		...(icon && !icon.isEmpty() ? { icon } : {}),
	});
	shown.add(notification);
	notification.on("click", () => {
		shown.delete(notification);
		pendingOpen = { postId: single?.id };
		openPlan();
	});
	notification.on("close", () => shown.delete(notification));
	notification.show();
}

/** IPC for the Creative Studio Plan tab. */
export function registerShareCalendarHandlers() {
	ipcMain.handle("share-calendar-list", () => calendar().list());
	ipcMain.handle("share-calendar-save", async (_e, post: unknown) => {
		const saved = await calendar().save(post);
		void scheduler?.check();
		return saved;
	});
	ipcMain.handle("share-calendar-delete", async (_e, id: unknown) => {
		if (typeof id !== "string") throw Error("Geçersiz takvim kaydı.");
		const removed = await calendar().remove(id);
		void scheduler?.check();
		return removed;
	});
	ipcMain.handle("share-calendar-copy-image", (_e, src: unknown) => {
		if (
			typeof src !== "string" ||
			src.length > MAX_IMAGE ||
			!/^data:image\/(png|jpeg|webp);base64,/.test(src)
		)
			throw Error("Görsel panoya kopyalanamadı.");
		const image = nativeImage.createFromDataURL(src);
		if (image.isEmpty()) throw Error("Görsel panoya kopyalanamadı.");
		clipboard.writeImage(image);
		return true;
	});
	ipcMain.handle("share-calendar-copy-text", (_e, text: unknown) => {
		if (typeof text !== "string" || text.length > 10_000) throw Error("Metin kopyalanamadı.");
		clipboard.writeText(text);
		return true;
	});
	// A notification click asks the home window to open the Plan tab; the window collects it here
	// on load as well, so a freshly created window does not miss it.
	ipcMain.handle("share-calendar-take-open", () => {
		const open = pendingOpen;
		pendingOpen = undefined;
		return open ?? null;
	});
}

/**
 * Starts reminders once the app is ready. Reminders keep firing while the app lives in the tray;
 * after a full quit, the first check on the next launch reports what was missed.
 */
export function startShareReminders(openPlan: () => void) {
	scheduler = new ReminderScheduler(calendar(), (due) => notify(due, openPlan));
	powerMonitor.on("resume", () => void scheduler?.check());
	powerMonitor.on("unlock-screen", () => void scheduler?.check());
	void scheduler.check();
}

/** Drops a pending Plan request when the click could not be delivered to the home window. */
export function clearPendingShareOpen() {
	pendingOpen = undefined;
}
