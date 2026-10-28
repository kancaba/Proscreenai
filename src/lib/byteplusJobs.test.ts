import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ByteplusJobs } from "../../electron/byteplusJobs";
import { DEFAULT_BYTEPLUS_OPTIONS } from "./byteplusSettings";

const roots: string[] = [];
async function store() {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "byteplus-jobs-test-"));
	roots.push(root);
	return new ByteplusJobs(root);
}
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});
describe("BytePlus durable budget and deduplication", () => {
	it("serializes simultaneous budget reservations across windows", async () => {
		const jobs = await store(),
			options = { ...DEFAULT_BYTEPLUS_OPTIONS, budgetUSD: 0.018 };
		const attempts = await Promise.allSettled([
			jobs.reserve("request-0001", options, 0),
			jobs.reserve("request-0002", options, 0),
		]);
		expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
		expect((await jobs.ledger()).reservedUSD).toBe(0.018);
	});
	it("keeps ambiguous charges and duplicate IDs across restarts", async () => {
		const jobs = await store();
		await jobs.reserve("request-0001", DEFAULT_BYTEPLUS_OPTIONS, 0);
		const reopened = new ByteplusJobs(jobs.root);
		await expect(reopened.reserve("request-0001", DEFAULT_BYTEPLUS_OPTIONS, 0)).rejects.toThrow(
			"daha önce",
		);
		const ledger = await reopened.ledger();
		expect(ledger.reservedUSD).toBe(0.018);
		expect(ledger.jobs[0].state).toBe("uncertain");
		expect(ledger.jobs[0].canRecover).toBe(false);
	});
	it("releases explicit rejection reservations but retains downloadable receipts without exposing URLs", async () => {
		const jobs = await store();
		const rejected = await jobs.reserve("request-0001", DEFAULT_BYTEPLUS_OPTIONS, 0);
		rejected.state = "failed";
		await jobs.update(rejected);
		expect((await jobs.ledger()).reservedUSD).toBe(0);
		const received = await jobs.reserve("request-0002", DEFAULT_BYTEPLUS_OPTIONS, 1);
		received.state = "received";
		received.receipt = {
			url: "https://images.volces.com/result.png?private-signature",
			model: DEFAULT_BYTEPLUS_OPTIONS.model,
			usage: { generated_images: 1 },
		};
		await jobs.update(received);
		const ledger = await jobs.ledger();
		expect(ledger.reservedUSD).toBe(0.018);
		expect(ledger.jobs.find((x) => x.id === received.id)?.canRecover).toBe(true);
		expect(JSON.stringify(ledger)).not.toContain("private-signature");
	});
	it("fails closed for corrupt journals and rejects path traversal", async () => {
		const jobs = await store();
		await fs.writeFile(path.join(jobs.root, "request-0001.json"), "broken");
		await expect(jobs.reserve("request-0002", DEFAULT_BYTEPLUS_OPTIONS, 0)).rejects.toThrow();
		await expect(jobs.read("../secret")).rejects.toThrow("kimliği");
	});
});
