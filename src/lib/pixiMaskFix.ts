import { AlphaMask, ScissorMask, StencilMask } from 'pixi.js';

/**
 * PixiJS 8.14 bug, fixed upstream in later 8.x: a mask effect is reset when it goes back to the
 * shared pool, and reset again when the pool is cleared on `renderer.destroy()`. The second reset
 * throws on the missing mask, so the renderer is left half destroyed. The next export then draws
 * with leftover pool state and loses the video on many frames. Reset becomes a no-op once done.
 */
type Resettable = { mask: unknown; reset(): void };

for (const MaskClass of [StencilMask, AlphaMask, ScissorMask]) {
	const proto = MaskClass.prototype as unknown as Resettable & { __nullSafeReset?: true };
	if (proto.__nullSafeReset) continue;
	const reset = proto.reset;
	proto.reset = function (this: Resettable) {
		if (this.mask == null) return;
		reset.call(this);
	};
	proto.__nullSafeReset = true;
}
