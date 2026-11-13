import { AlphaMask, Container, ScissorMask, StencilMask } from "pixi.js";
import { describe, expect, it } from "vitest";
import "./pixiMaskFix";

describe("pixi mask fix", () => {
	it("lets a pooled mask effect be reset again when the renderer is destroyed", () => {
		for (const MaskClass of [StencilMask, AlphaMask, ScissorMask]) {
			const mask = new Container();
			const effect = new MaskClass({ mask } as never);
			effect.reset(); // back to the pool
			expect(() => effect.destroy()).not.toThrow(); // pool cleared by renderer.destroy()
			expect(mask.measurable).toBe(true);
		}
	});
});
