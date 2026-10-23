export function layoutTrackLanes<T extends { id: string; span: { start: number; end: number } }>(items: T[]) {
  const ends: number[] = [], lanes = new Map<string, number>()
  for (const item of [...items].sort((a,b) => a.span.start-b.span.start || a.span.end-b.span.end)) {
    let lane = ends.findIndex(end => end <= item.span.start)
    if (lane < 0) lane = ends.length
    ends[lane] = item.span.end; lanes.set(item.id,lane)
  }
  return { lanes, count: Math.max(1, ends.length) }
}
export function trackNeighbours<T extends {id:string;rowId:string}>(items:T[], id:string) {
  const rowId = items.find(item=>item.id===id)?.rowId
  return rowId ? items.filter(item=>item.id!==id && item.rowId===rowId) : []
}
