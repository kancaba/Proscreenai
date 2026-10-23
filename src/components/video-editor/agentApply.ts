import type { Proposal, ProposalSet, TextPreset } from "@/lib/agent/proposals";
import { TEXT_STYLE_PRESETS } from "./annotationEffects";
import {
  type AnnotationRegion,
  DEFAULT_ANNOTATION_STYLE,
  type SpeedRegion,
  type TrimRegion,
  type ZoomRegion,
} from "./types";

export interface EditorRegions {
  zooms: ZoomRegion[];
  trims: TrimRegion[];
  speeds: SpeedRegion[];
  annotations: AnnotationRegion[];
}

export interface RegionIds {
  zoom: () => string;
  trim: () => string;
  speed: () => string;
  annotation: () => string;
  zIndex: () => number;
}

/** Where each text style sits by default (percent of the frame). */
const PLACEMENT: Record<TextPreset, { position: { x: number; y: number }; size: { width: number; height: number } }> = {
  title: { position: { x: 10, y: 8 }, size: { width: 80, height: 18 } },
  subtitle: { position: { x: 10, y: 74 }, size: { width: 80, height: 20 } },
  label: { position: { x: 30, y: 10 }, size: { width: 40, height: 10 } },
  callout: { position: { x: 25, y: 40 }, size: { width: 50, height: 16 } },
  typing: { position: { x: 10, y: 40 }, size: { width: 80, height: 16 } },
};

const overlaps = (a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }) => a.startMs < b.endMs && b.startMs < a.endMs;

function textRegion(text: string, startMs: number, endMs: number, preset: TextPreset, ids: RegionIds, position?: { x: number; y: number }): AnnotationRegion {
  const look = TEXT_STYLE_PRESETS.find((candidate) => candidate.id === preset);
  const place = PLACEMENT[preset];
  return {
    id: ids.annotation(),
    startMs,
    endMs,
    type: "text",
    content: text,
    textContent: text,
    position: position ?? place.position,
    size: place.size,
    style: { ...DEFAULT_ANNOTATION_STYLE, ...look?.style },
    zIndex: ids.zIndex(),
    ...(look?.animation ? { animation: look.animation } : {}),
  };
}

/** Joins cut ranges that touch or overlap, so the timeline shows one cut per stretch. */
export function mergeTrims(trims: TrimRegion[]): TrimRegion[] {
  const sorted = [...trims].sort((a, b) => a.startMs - b.startMs);
  const merged: TrimRegion[] = [];
  for (const trim of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && trim.startMs <= previous.endMs) previous.endMs = Math.max(previous.endMs, trim.endMs);
    else merged.push({ ...trim });
  }
  return merged;
}

/**
 * The project's regions with the chosen proposals applied. Zooms and speech captions
 * replace the current ones when the agent asked for that and at least one was chosen;
 * otherwise new items that would collide with existing ones are left out.
 */
export function applyProposals(current: EditorRegions, set: ProposalSet, chosen: Set<string>, ids: RegionIds): EditorRegions {
  const picked = set.items.filter((item) => chosen.has(item.id)).sort((a, b) => a.startMs - b.startMs);
  const of = <K extends Proposal["kind"]>(kind: K) => picked.filter((item): item is Extract<Proposal, { kind: K }> => item.kind === kind);

  const newZooms = of("zoom");
  let zooms = set.replaceZooms && newZooms.length > 0 ? [] : [...current.zooms];
  for (const item of newZooms) {
    if (zooms.some((zoom) => overlaps(zoom, item))) continue;
    zooms.push({ id: ids.zoom(), startMs: item.startMs, endMs: item.endMs, depth: item.depth, focus: { ...item.focus } });
  }
  zooms = zooms.sort((a, b) => a.startMs - b.startMs);

  const trims = mergeTrims([...current.trims, ...of("trim").map((item) => ({ id: ids.trim(), startMs: item.startMs, endMs: item.endMs }))]);

  const speeds = [...current.speeds];
  for (const item of of("speed")) {
    if (speeds.some((speed) => overlaps(speed, item))) continue;
    speeds.push({ id: ids.speed(), startMs: item.startMs, endMs: item.endMs, speed: item.speed });
  }

  const newCaptions = of("caption");
  let annotations = set.replaceCaptions && newCaptions.length > 0 ? current.annotations.filter((region) => region.generatedBy !== "transcript") : [...current.annotations];
  annotations = [
    ...annotations,
    ...newCaptions.map((item) => ({ ...textRegion(item.text, item.startMs, item.endMs, "subtitle", ids), generatedBy: "transcript" as const })),
    ...of("text").map((item) => textRegion(item.text, item.startMs, item.endMs, item.preset, ids, item.position)),
  ];

  return { zooms, trims, speeds: speeds.sort((a, b) => a.startMs - b.startMs), annotations };
}
