import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createAgentSession } from "../../../electron/agents/agentSession";
import { EMPTY_PROPOSALS } from "./proposals";

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-tools-"));
const videoPath = path.join(dir, "video.mp4");
afterAll(() => fs.rm(dir, { recursive: true, force: true }));

function session() {
  return createAgentSession({
    snapshot: { videoPath, durationMs: 20000, language: "tr", aspectRatio: "16:9", trims: [], zooms: [], speeds: [], captions: [], texts: [], blurs: [] },
    initialProposals: EMPTY_PROPOSALS,
    framesAllowed: false,
    deps: {} as never,
    signal: new AbortController().signal,
    onToolCall: () => undefined,
  });
}
const tool = (s: ReturnType<typeof session>, name: string) => {
  const found = s.tools.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`no tool ${name}`);
  return found;
};
const text = (result: { content: Array<{ type: string; text?: string }> }) => result.content[0]?.text ?? "";

describe("agent tools for a tutorial edit", () => {
  it("lists typing stretches from the recorded key presses", async () => {
    const keys = [2000, 2200, 2500, 2800, 3100, 3400, 3700, 9000];
    await fs.writeFile(`${videoPath}.cursor.json`, JSON.stringify({ samples: [], keys }));
    const result = JSON.parse(text(await tool(session(), "get_typing").handler({})));
    expect(result.tracked).toBe(true);
    expect(result.typing).toEqual([{ startMs: 1850, endMs: 4100, keys: 7 }]);
  });

  it("proposes fades at the ends of the video", async () => {
    const s = session();
    expect((await tool(s, "propose_fade").handler({ fadeOutMs: 1000 })).isError).toBeFalsy();
    expect(s.getProposals().items).toMatchObject([{ kind: "fade", edge: "out", startMs: 19000, endMs: 20000 }]);
    expect((await tool(s, "propose_fade").handler({})).isError).toBe(true);
  });
});
