import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { requestByteplusWriting } from "../../electron/byteplusClient";
import { ByteplusJobs } from "../../electron/byteplusJobs";
import {
	BYTEPLUS_WRITER_RESERVE_USD,
	byteplusWriterCost,
	byteplusWriterOf,
	DEFAULT_BYTEPLUS_OPTIONS,
	isByteplusOptions,
} from "./byteplusSettings";
import {
	BYTEPLUS_CHAT_ENDPOINT,
	parseSeedreamWriting,
	seedreamWriterPayload,
	withSeedreamPrompt,
} from "./byteplusWriter";

const input = (visibleText = "", watermark = true) => ({
	writer: "dola-seed-2-1-turbo-260628" as const,
	request: "10 Kasım için Mersel logolu sade bir anma postu",
	references: ["data:image/jpeg;base64,AAAA"],
	referenceNames: ["mersel logo"],
	width: 1080,
	height: 1350,
	options: { ...DEFAULT_BYTEPLUS_OPTIONS, visibleText, watermark },
	posterMethod: false,
});
const system = (payload: ReturnType<typeof seedreamWriterPayload>) =>
	payload.messages[0].content as string;

describe("Seedream prompt writer", () => {
	it("writes the copy itself when none is given, and keeps the user's copy when it is", () => {
		const free = seedreamWriterPayload(input());
		expect(system(free)).toMatch(/write it yourself/);
		expect(system(free)).toMatch(/Never invent prices/);
		const fixed = seedreamWriterPayload(input("10 KASIM\nSaygıyla anıyoruz."));
		expect(system(fixed)).toContain(JSON.stringify("10 KASIM\nSaygıyla anıyoruz."));
		expect(system(fixed)).not.toMatch(/write it yourself/);
	});

	it("preserves references and medium without forcing stock layouts or replacing subjects", () => {
		const payload = seedreamWriterPayload(input());
		expect(payload.model).toBe("dola-seed-2-1-turbo-260628");
		const user = payload.messages[1].content as { type: string; image_url?: { url: string } }[];
		expect(user[0]).toMatchObject({ type: "text" });
		expect(user[1]).toEqual({
			type: "image_url",
			image_url: { url: "data:image/jpeg;base64,AAAA" },
		});
		expect(system(payload)).toMatch(/"mersel logo"/);
		expect(system(payload)).toMatch(/bottom-right watermark area/);
		expect(system(payload)).toMatch(/Never introduce placeholders/);
		expect(system(payload)).toMatch(/Do not substitute a different subject/);
		expect(system(seedreamWriterPayload(input("", false)))).not.toMatch(
			/bottom-right watermark area/,
		);
	});

	it("reads the answer, also inside a code fence, and rejects unusable ones", () => {
		expect(
			parseSeedreamWriting(
				'```json\n{"prompt":" A calm poster ","copy":"10 KASIM","warnings":["Fotoğraf ekleyin",3]}\n```',
			),
		).toEqual({
			prompt: "A calm poster",
			copy: "10 KASIM",
			warnings: ["Fotoğraf ekleyin"],
		});
		expect(parseSeedreamWriting("Here you go")).toBeUndefined();
		expect(parseSeedreamWriting('{"copy":"x"}')).toBeUndefined();
		expect(withSeedreamPrompt("istek", "prompt")).toBe("prompt");
	});

	it("does not silently truncate detailed briefs or literal copy", () => {
		const prompt = "Detailed material and lighting. ".repeat(180);
		const copy = "İstanbul ".repeat(100);
		expect(parseSeedreamWriting(JSON.stringify({ prompt, copy }))?.prompt).toBe(prompt.trim());
		expect(parseSeedreamWriting(JSON.stringify({ prompt, copy }))?.copy).toBe(copy.trim());
		expect(parseSeedreamWriting(JSON.stringify({ prompt: "x".repeat(20001) }))).toBeUndefined();
	});

	it("is on by default, can be turned off, and older settings still load", () => {
		expect(byteplusWriterOf(DEFAULT_BYTEPLUS_OPTIONS)).toBe("dola-seed-2-1-turbo-260628");
		expect(byteplusWriterOf({ ...DEFAULT_BYTEPLUS_OPTIONS, writer: "off" })).toBeNull();
		const { writer: _writer, ...older } = DEFAULT_BYTEPLUS_OPTIONS;
		expect(isByteplusOptions(older)).toBe(true);
		expect(byteplusWriterOf(older)).toBe("dola-seed-2-1-turbo-260628");
		expect(isByteplusOptions({ ...DEFAULT_BYTEPLUS_OPTIONS, writer: "gpt-x" })).toBe(false);
		expect(byteplusWriterCost("dola-seed-2-1-turbo-260628", 4000, 2000)).toBeCloseTo(0.007);
	});

	it("calls ModelArk chat with the key and returns the writing with its token use", async () => {
		const calls: { url: string; auth: string | null }[] = [];
		const fetcher = (async (url: string, init: RequestInit) => {
			calls.push({ url, auth: new Headers(init.headers).get("authorization") });
			return Response.json({
				choices: [
					{ message: { content: '{"prompt":"Black poster","copy":"10 KASIM","warnings":[]}' } },
				],
				usage: { prompt_tokens: 3000, completion_tokens: 900 },
			});
		}) as typeof fetch;
		const answer = await requestByteplusWriting(
			"ark-test",
			input(),
			new AbortController().signal,
			fetcher,
		);
		expect(calls).toEqual([{ url: BYTEPLUS_CHAT_ENDPOINT, auth: "Bearer ark-test" }]);
		expect(answer).toEqual({
			writing: { prompt: "Black poster", copy: "10 KASIM", warnings: [] },
			inputTokens: 3000,
			outputTokens: 900,
		});
		const missing = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
		await expect(
			requestByteplusWriting("ark-test", input(), new AbortController().signal, missing),
		).rejects.toThrow(/açık değil/);
	});

	it("reserves the writer only when the image after it also fits the spending limit", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "byteplus-writer-"));
		const jobs = new ByteplusJobs(root);
		// Flash costs 0.018; with the writer's reserve that needs 0.038.
		const tight = { ...DEFAULT_BYTEPLUS_OPTIONS, budgetUSD: 0.03 };
		await expect(
			jobs.reserve("writer-job-1", tight, 0, "dola-seed-2-1-turbo-260628"),
		).rejects.toThrow(/sınırı/);
		const job = await jobs.reserve(
			"writer-job-2",
			{ ...tight, budgetUSD: 0.04 },
			0,
			"dola-seed-2-1-turbo-260628",
		);
		expect(job.estimatedCostUSD).toBe(BYTEPLUS_WRITER_RESERVE_USD);
		const ledger = await jobs.ledger();
		expect(ledger.jobs[0]).toMatchObject({
			writer: "dola-seed-2-1-turbo-260628",
			canRecover: false,
		});
		await fs.rm(root, { recursive: true, force: true });
	});
});
