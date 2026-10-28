import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { app, ipcMain, safeStorage } from "electron";

let cached: string | null = null;
const file = () => path.join(app.getPath("userData"), "byteplus-key.bin");
function secure() {
	return (
		safeStorage.isEncryptionAvailable() &&
		(process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text")
	);
}
export async function readByteplusKey() {
	if (cached) return cached;
	if (!secure()) return null;
	try {
		cached = safeStorage.decryptString(await fs.readFile(file()));
		return cached;
	} catch {
		return null;
	}
}
export function registerByteplusKeys() {
	ipcMain.handle("byteplus-key-status", async () => ({
		configured: !!(await readByteplusKey()),
		persistent: secure(),
	}));
	ipcMain.handle("byteplus-save-key", async (_e, value: unknown) => {
		if (
			typeof value !== "string" ||
			value.trim().length < 16 ||
			value.length > 512 ||
			/\s/.test(value.trim())
		)
			throw Error("Geçerli ModelArk API anahtarını girin.");
		const key = value.trim();
		if (secure()) {
			const tmp = file() + "." + randomUUID() + ".tmp";
			await fs.mkdir(path.dirname(file()), { recursive: true });
			try {
				await fs.writeFile(tmp, safeStorage.encryptString(key), { mode: 0o600 });
				await fs.rename(tmp, file());
			} finally {
				await fs.rm(tmp, { force: true });
			}
		} else await fs.rm(file(), { force: true });
		cached = key;
		return { configured: true, persistent: secure() };
	});
	ipcMain.handle("byteplus-clear-key", async () => {
		cached = null;
		await fs.rm(file(), { force: true });
		return { configured: false, persistent: secure() };
	});
}
