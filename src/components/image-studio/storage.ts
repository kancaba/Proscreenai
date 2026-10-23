import { parseDocument, type ImageDocument } from "./document";
export type SavedImage = { id: string; name: string; updatedAt: number; document: ImageDocument };
let dbPromise: Promise<IDBDatabase> | undefined;
function db() {
	return (dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
		const r = indexedDB.open("screenmovie-image-studio", 1);
		r.onupgradeneeded = () => r.result.createObjectStore("documents", { keyPath: "id" });
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => {
			dbPromise = undefined;
			reject(r.error);
		};
	}));
}
async function request<T>(
	mode: IDBTransactionMode,
	fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
	const database = await db();
	return new Promise((resolve, reject) => {
		const tx = database.transaction("documents", mode),
			r = fn(tx.objectStore("documents"));
		tx.oncomplete = () => resolve(r.result);
		tx.onabort = () => reject(tx.error || r.error);
		tx.onerror = () => reject(tx.error);
	});
}
export async function saveImageDraft(document: ImageDocument) {
	await request("readwrite", (s) =>
		s.put({ id: "draft", name: document.name, updatedAt: Date.now(), document }),
	);
}
export async function loadImageDraft() {
	const record = await request<SavedImage | undefined>("readonly", (s) => s.get("draft"));
	return record ? parseDocument(record.document) : null;
}
export async function saveImageProject(document: ImageDocument, id: string) {
	await request("readwrite", (s) =>
		s.put({ id, name: document.name, updatedAt: Date.now(), document }),
	);
}
export async function listImageProjects() {
	return (await request<SavedImage[]>("readonly", (s) => s.getAll()))
		.filter((r) => r.id !== "draft")
		.sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function deleteImageProject(id: string) {
	if (id === "draft") return;
	await request("readwrite", (s) => s.delete(id));
}
