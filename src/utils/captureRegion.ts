/** Display-relative coordinates, independent of Retina scaling and monitor origin. */
export interface CaptureRegion { x: number; y: number; width: number; height: number }
export function validateCaptureRegion(value: unknown): CaptureRegion | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as CaptureRegion;
  if (![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.x < 0 || r.y < 0 || r.width < .02 || r.height < .02 || r.x + r.width > 1.000001 || r.y + r.height > 1.000001) return null;
  return { x: r.x, y: r.y, width: Math.min(r.width, 1 - r.x), height: Math.min(r.height, 1 - r.y) };
}
export function regionFromPoints(a: {x:number;y:number}, b: {x:number;y:number}): CaptureRegion {
  return { x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), width: Math.abs(a.x-b.x), height: Math.abs(a.y-b.y) };
}
export function regionCropFilter(r: CaptureRegion) {
  return `crop=w='max(2,trunc(iw*${r.width}/2)*2)':h='max(2,trunc(ih*${r.height}/2)*2)':x='trunc(iw*${r.x}/2)*2':y='trunc(ih*${r.y}/2)*2'`;
}
