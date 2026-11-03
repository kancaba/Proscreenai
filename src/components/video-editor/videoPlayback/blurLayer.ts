import { BlurFilter, Container, Graphics, Rectangle, Sprite, Texture, type TextureSource } from 'pixi.js';
import { PixelateFilter } from 'pixi-filters/pixelate';
import { blurAmountPx, type BlurRegion, type BlurStyle } from '../blurRegions';

type Piece = {
  container: Container;
  mask: Graphics;
  /** Pixelated copy of just the area: opaque, so nothing sharp can show through what is on top. */
  base: Sprite;
  pixelate: PixelateFilter;
  /** Blurred copy of the area and what is around it (blur style only). */
  soft: Sprite | null;
  blur: BlurFilter | null;
  style: BlurStyle;
};

type Frame = { x: number; y: number; width: number; height: number };

/** Part of the frame from fractions, in whole pixels and inside it, grown by `margin` pixels. */
function pixelFrame(rect: BlurRegion['rect'], frameWidth: number, frameHeight: number, margin = 0): Frame {
  const left = Math.max(0, Math.min(frameWidth - 1, Math.floor(rect.x * frameWidth - margin)));
  const top = Math.max(0, Math.min(frameHeight - 1, Math.floor(rect.y * frameHeight - margin)));
  const right = Math.max(left + 1, Math.min(frameWidth, Math.ceil((rect.x + rect.width) * frameWidth + margin)));
  const bottom = Math.max(top + 1, Math.min(frameHeight, Math.ceil((rect.y + rect.height) * frameHeight + margin)));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Shows `frame` of `source` on `sprite`, replacing its texture only when that changed. */
function showFrame(sprite: Sprite, source: TextureSource, frame: Frame): void {
  const current = sprite.texture;
  const same = current !== Texture.EMPTY && current.source === source
    && current.frame.x === frame.x && current.frame.y === frame.y && current.frame.width === frame.width && current.frame.height === frame.height;
  if (same) return;
  // The export gives every frame a new texture; the preview's only changes when the area does.
  sprite.texture = new Texture({ source, frame: new Rectangle(frame.x, frame.y, frame.width, frame.height) });
  if (current !== Texture.EMPTY) current.destroy(false);
}

/**
 * Blurred areas drawn over the video sprite, inside the same container, so they zoom, pan and crop
 * with the video. Each area is cut to its rectangle: an opaque pixelated copy of it, and for the
 * blur style a blurred copy of it and its surroundings on top (blurring needs what is around the
 * area, and near the frame's edge the blur fades out onto the pixelated copy, never onto the
 * sharp video). Used by the preview and the export, so both look the same.
 */
export class BlurAreaLayer {
  readonly container = new Container();
  private pieces = new Map<string, Piece>();

  /** Shows `regions` over `videoSprite`; `cameraScale` is the zoom the container is drawn at. */
  update(regions: BlurRegion[], videoSprite: Sprite, cameraScale: number): void {
    const source = videoSprite.texture.source;
    const frameWidth = source.width;
    const frameHeight = source.height;
    const seen = new Set<string>();
    if (frameWidth > 0 && frameHeight > 0) {
      const scale = videoSprite.scale.x;
      // Screen pixels per frame pixel, as the area is finally drawn.
      const drawnScale = Math.max(0.0001, scale * Math.max(0.01, cameraScale));
      const place = (sprite: Sprite, frame: Frame) => {
        sprite.scale.copyFrom(videoSprite.scale);
        sprite.position.set(videoSprite.position.x + frame.x * scale, videoSprite.position.y + frame.y * videoSprite.scale.y);
      };
      for (const region of regions) {
        let piece = this.pieces.get(region.id);
        if (piece && piece.style !== region.style) {
          this.remove(region.id);
          piece = undefined;
        }
        if (!piece) piece = this.create(region.id, region.style);

        const area = pixelFrame(region.rect, frameWidth, frameHeight);
        const shortSide = Math.min(area.width, area.height) * drawnScale;
        showFrame(piece.base, source, area);
        place(piece.base, area);
        piece.pixelate.size = Math.round(blurAmountPx('pixelate', region.style === 'pixelate' ? region.strength : 0.5, shortSide));

        if (piece.soft && piece.blur) {
          const amount = blurAmountPx('blur', region.strength, shortSide);
          // The blur reaches about twice its strength; take that much of the frame around the area.
          const around = pixelFrame(region.rect, frameWidth, frameHeight, (amount * 2) / drawnScale);
          showFrame(piece.soft, source, around);
          place(piece.soft, around);
          piece.blur.strength = amount;
        }

        piece.mask.clear();
        piece.mask.rect(videoSprite.position.x + area.x * scale, videoSprite.position.y + area.y * videoSprite.scale.y, area.width * scale, area.height * videoSprite.scale.y);
        piece.mask.fill({ color: 0xffffff });
        seen.add(region.id);
      }
    }
    for (const id of [...this.pieces.keys()]) {
      if (!seen.has(id)) this.remove(id);
    }
  }

  destroy(): void {
    for (const id of [...this.pieces.keys()]) this.remove(id);
    this.container.destroy({ children: true });
  }

  private create(id: string, style: BlurStyle): Piece {
    const container = new Container();
    const mask = new Graphics();
    const base = new Sprite(Texture.EMPTY);
    const pixelate = new PixelateFilter(10);
    pixelate.resolution = 'inherit';
    base.filters = [pixelate];
    container.addChild(base);
    let soft: Sprite | null = null;
    let blur: BlurFilter | null = null;
    if (style === 'blur') {
      soft = new Sprite(Texture.EMPTY);
      blur = new BlurFilter({ strength: 10, quality: 6, kernelSize: 11 });
      blur.resolution = 'inherit';
      soft.filters = [blur];
      container.addChild(soft);
    }
    container.addChild(mask);
    container.mask = mask;
    this.container.addChild(container);
    const piece = { container, mask, base, pixelate, soft, blur, style };
    this.pieces.set(id, piece);
    return piece;
  }

  private remove(id: string): void {
    const piece = this.pieces.get(id);
    if (!piece) return;
    this.pieces.delete(id);
    this.container.removeChild(piece.container);
    piece.container.mask = null;
    for (const sprite of [piece.base, piece.soft]) {
      if (!sprite) continue;
      sprite.filters = [];
      const texture = sprite.texture;
      sprite.destroy({ texture: false });
      if (texture !== Texture.EMPTY) texture.destroy(false);
    }
    piece.pixelate.destroy();
    piece.blur?.destroy();
    piece.mask.destroy();
    piece.container.destroy();
  }
}
