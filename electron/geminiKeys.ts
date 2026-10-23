import { app, ipcMain, safeStorage } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
let cached: string | null = null;
const file = () => path.join(app.getPath("userData"), "gemini-key.bin");
function secure() {
	return (
		safeStorage.isEncryptionAvailable() &&
		(process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text")
	);
}
export async function readGeminiKey() {
	if (cached) return cached;
	if (!secure()) return null;
	try {
		cached = safeStorage.decryptString(await fs.readFile(file()));
		return cached;
	} catch {
		return null;
	}
}
export function registerGeminiKeys() {
	ipcMain.handle("gemini-key-status", async () => ({
		configured: !!(await readGeminiKey()),
		persistent: secure(),
	}));
	ipcMain.handle("gemini-save-key", async (_e, value: unknown) => {
		if (
			typeof value !== "string" ||
			value.trim().length < 16 ||
			value.length > 512 ||
			/\s/.test(value.trim())
		)
			throw Error("Geçerli Gemini anahtarını girin.");
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
	ipcMain.handle("gemini-clear-key", async () => {
		cached = null;
		await fs.rm(file(), { force: true });
		return { configured: false, persistent: secure() };
	});
}
