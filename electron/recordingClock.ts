/** A single monotonic output timeline, excluding paused wall time. */
export class RecordingClock {
	private anchor = 0;
	private accumulated = 0;
	private active = false;
	private held = false;
	constructor(private now: () => number = () => performance.now()) {}
	start() {
		this.anchor = this.now();
		this.accumulated = 0;
		this.active = true;
		this.held = false;
	}
	elapsed() {
		return (
			this.accumulated + (this.active && !this.held ? Math.max(0, this.now() - this.anchor) : 0)
		);
	}
	pause() {
		if (!this.active || this.held) return;
		this.accumulated = this.elapsed();
		this.held = true;
	}
	resume() {
		if (!this.active || !this.held) return;
		this.anchor = this.now();
		this.held = false;
	}
	sync(elapsedMs: number, paused: boolean) {
		if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw Error("Invalid recording time");
		this.accumulated = elapsedMs;
		this.anchor = this.now();
		this.held = paused;
		this.active = true;
	}
	stop() {
		this.accumulated = this.elapsed();
		this.active = false;
		this.held = false;
	}
	get recording() {
		return this.active;
	}
	get paused() {
		return this.held;
	}
}
