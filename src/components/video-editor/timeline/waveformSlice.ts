export type Waveform = { durationMs: number; peaksPerSecond: number; peaks: number[] };

/** Peak values covering `lengthMs` of the file from `offsetMs`, one per output column. */
export function sliceWaveform(waveform: Waveform, offsetMs: number, lengthMs: number, columns: number): number[] {
	if (columns <= 0 || lengthMs <= 0) return [];
	const perMs = waveform.peaksPerSecond / 1000;
	const result: number[] = [];
	for (let column = 0; column < columns; column++) {
		const from = Math.floor((offsetMs + (lengthMs * column) / columns) * perMs);
		const to = Math.max(from + 1, Math.floor((offsetMs + (lengthMs * (column + 1)) / columns) * perMs));
		let peak = 0;
		for (let i = from; i < to && i < waveform.peaks.length; i++) peak = Math.max(peak, waveform.peaks[i] ?? 0);
		result.push(peak);
	}
	return result;
}
