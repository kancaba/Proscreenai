import { describe, it, expect } from "vitest";
import { RecordingClock } from "../../electron/recordingClock";
describe("RecordingClock", () => {
	it("excludes ten pause intervals and keeps stop and duplicate transitions stable", () => {
		let now = 0;
		const clock = new RecordingClock(() => now);
		clock.start();
		for (let i = 0; i < 10; i++) {
			now += 1000;
			clock.pause();
			clock.pause();
			now += 9000;
			expect(clock.elapsed()).toBe((i + 1) * 1000);
			clock.resume();
			clock.resume();
		}
		now += 500;
		expect(clock.elapsed()).toBe(10500);
		clock.stop();
		now += 50000;
		expect(clock.elapsed()).toBe(10500);
		expect(clock.recording).toBe(false);
		clock.start();
		expect(clock.elapsed()).toBe(0);
	});
	it("aligns HUD and telemetry to acknowledged native elapsed time", () => {
		let now = 200;
		const clock = new RecordingClock(() => now);
		clock.sync(1000, true);
		now += 3000;
		expect(clock.elapsed()).toBe(1000);
		clock.sync(1000, false);
		now += 50;
		expect(clock.elapsed()).toBe(1050);
		expect(() => clock.sync(NaN, false)).toThrow();
	});
});
