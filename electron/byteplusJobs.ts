import fs from "node:fs/promises";
import path from "node:path";
import {
	type ByteplusJobSummary,
	type ByteplusLedger,
	type ByteplusOptions,
	BYTEPLUS_WRITER_RESERVE_USD,
	type ByteplusWriter,
	byteplusEstimate,
	isByteplusOptions,
} from "../src/lib/byteplusSettings";
import type { ImageUsage } from "../src/lib/imageUsage";
import type { ByteplusReceipt } from "./byteplusClient";
export type ByteplusJob = {
	id: string;
	state: ByteplusJobSummary["state"];
	options: ByteplusOptions;
	estimatedCostUSD: number;
	referenceCount: number;
	createdAt: number;
	receipt?: ByteplusReceipt;
	usage?: ImageUsage;
	actualWidth?: number;
	actualHeight?: number;
	/** The text model, for a prompt written before the image; no image belongs to it. */
	writer?: ByteplusWriter;
};
const validId = (id: string) => /^[\w-]{8,80}$/.test(id);
/** Serializes budget reservations across windows in this Electron process. */
export class ByteplusJobs {
	private pending: Promise<unknown> = Promise.resolve();
	constructor(readonly root: string) {}
	private serial<T>(action: () => Promise<T>): Promise<T> {
		const next = this.pending.then(action, action);
		this.pending = next.catch(() => {
			/* A rejected reservation must not block subsequent operations. */
		});
		return next;
	}
	private file(id: string) {
		if (!validId(id)) throw Error("Geçersiz üretim kimliği.");
		return path.join(this.root, `${id}.json`);
	}
	async read(id: string): Promise<ByteplusJob> {
		const x = JSON.parse(await fs.readFile(this.file(id), "utf8")) as ByteplusJob;
		if (
			x.id !== id ||
			!isByteplusOptions(x.options) ||
			!Number.isFinite(x.estimatedCostUSD) ||
			x.estimatedCostUSD < 0 ||
			!Number.isInteger(x.referenceCount) ||
			x.referenceCount < 0 ||
			x.referenceCount > 4 ||
			!["submitted", "received", "complete", "failed", "uncertain"].includes(x.state)
		)
			throw Error("Üretim kaydı okunamadı.");
		return x;
	}
	private async all() {
		await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
		const names = (await fs.readdir(this.root)).filter(
			(n) => n.endsWith(".json") && validId(n.slice(0, -5)),
		);
		// A corrupt journal must fail closed instead of silently resetting the budget.
		return Promise.all(names.map((n) => this.read(n.slice(0, -5))));
	}
	async ledger(): Promise<ByteplusLedger> {
		return this.serial(async () => {
			const jobs = await this.all();
			return {
				reservedUSD:
					Math.round(
						jobs.filter((j) => j.state !== "failed").reduce((n, j) => n + j.estimatedCostUSD, 0) *
							1e6,
					) / 1e6,
				jobs: jobs
					.sort((a, b) => b.createdAt - a.createdAt)
					.slice(0, 30)
					.map((j) => ({
						id: j.id,
						state: j.state === "submitted" ? "uncertain" : j.state,
						model: j.options.model,
						size: j.options.size,
						estimatedCostUSD: j.estimatedCostUSD,
						createdAt: j.createdAt,
						canRecover: !j.writer && (j.state === "complete" || !!j.receipt),
						...(j.writer ? { writer: j.writer } : {}),
					})),
			};
		});
	}
	/** With `writer`, reserves a prompt written before the image, only when the image fits the limit too. */
	async reserve(id: string, options: ByteplusOptions, references: number, writer?: ByteplusWriter) {
		return this.serial(async () => {
			this.file(id);
			if (!isByteplusOptions(options)) throw Error("Geçersiz BytePlus ayarları.");
			const jobs = await this.all();
			if (jobs.some((j) => j.id === id))
				throw Error(
					"Bu istek daha önce gönderildi. Yeni üretim yapılmadı; kayıtlı sonucu kurtarabilirsiniz.",
				);
			const image = byteplusEstimate(options.model, options.size, references);
			const estimate = writer ? BYTEPLUS_WRITER_RESERVE_USD : image;
			const used = jobs
				.filter((j) => j.state !== "failed")
				.reduce((n, j) => n + j.estimatedCostUSD, 0);
			if (Math.round((used + estimate + (writer ? image : 0)) * 1e6) > Math.round(options.budgetUSD * 1e6))
				throw Error(
					"Yerel BytePlus harcama sınırı bu üretim için yetersiz. Sınırı ayarlardan artırın; hesap bakiyesi ayrıca kontrol edilmelidir.",
				);
			const job: ByteplusJob = {
				id,
				options,
				referenceCount: references,
				state: "submitted",
				estimatedCostUSD: estimate,
				createdAt: Date.now(),
				...(writer ? { writer } : {}),
			};
			await fs.writeFile(this.file(id), JSON.stringify(job), { flag: "wx", mode: 0o600 });
			return job;
		});
	}
	async update(job: ByteplusJob) {
		return this.serial(async () => {
			const file = this.file(job.id),
				tmp = file + ".tmp";
			await fs.writeFile(tmp, JSON.stringify(job), { mode: 0o600 });
			await fs.rename(tmp, file);
		});
	}
	imageFile(id: string) {
		this.file(id);
		return path.join(this.root, `${id}.png`);
	}
}
