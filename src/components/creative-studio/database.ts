import type { Brand, Creation } from "./brand";
let connection: Promise<IDBDatabase> | undefined;
function db() {
	return (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
		const r = indexedDB.open("screenmovie-creative-library", 1);
		r.onupgradeneeded = () => {
			r.result.createObjectStore("brands", { keyPath: "id" });
			r.result.createObjectStore("creations", { keyPath: "id" });
		};
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => {
			connection = undefined;
			reject(r.error);
		};
	}));
}
async function access<T>(
	store: string,
	mode: IDBTransactionMode,
	action: (s: IDBObjectStore) => IDBRequest<T>,
) {
	const d = await db();
	return new Promise<T>((resolve, reject) => {
		const tx = d.transaction(store, mode),
			r = action(tx.objectStore(store));
		tx.oncomplete = () => resolve(r.result);
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error || r.error);
	});
}
export const listBrands = () => access<Brand[]>("brands", "readonly", (s) => s.getAll());
export const saveBrand = (b: Brand) => access("brands", "readwrite", (s) => s.put(b));
export const listCreations = () => access<Creation[]>("creations", "readonly", (s) => s.getAll());
export const saveCreation = (c: Creation) => access("creations", "readwrite", (s) => s.put(c));

/** Soft deletion keeps products, assets and gallery associations recoverable. */
export async function setBrandArchived(id: string, archived: boolean): Promise<Brand> {
	const d = await db();
	return new Promise((resolve, reject) => {
		const tx = d.transaction("brands", "readwrite"), store = tx.objectStore("brands");
		let brand: Brand | undefined;
		const request = store.get(id);
		request.onsuccess = () => {
			if (!request.result) { tx.abort(); return; }
			brand = { ...request.result };
			if (archived) brand!.deletedAt = Date.now();
			else delete brand!.deletedAt;
			store.put(brand!);
		};
		tx.oncomplete = () => resolve(brand!);
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error || Error("Marka bulunamadı."));
	});
}

/** Retain only the latest previews while scanning, without loading the whole gallery into memory. */
export async function listRecentCreations(limit = 4): Promise<Creation[]> {
	const d = await db();
	return new Promise((resolve, reject) => {
		const tx = d.transaction("creations", "readonly");
		const request = tx.objectStore("creations").openCursor();
		const latest: Creation[] = [];
		request.onsuccess = () => {
			const cursor = request.result;
			if (!cursor) return;
			latest.push(cursor.value as Creation);
			latest.sort((a, b) => b.createdAt - a.createdAt);
			latest.splice(limit);
			cursor.continue();
		};
		tx.oncomplete = () => resolve(latest);
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error || request.error);
	});
}
