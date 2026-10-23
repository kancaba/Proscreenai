import { getAnnotationText, getAnnotationImage } from '@/components/video-editor/annotationText';
import { fitFontSize, layoutRichText, type MeasureText, measureRichText } from '@/lib/text/textLayout';
import type { AnnotationRegion, ArrowDirection } from '@/components/video-editor/types';
import {
  type AnnotationAnimationState,
  DEFAULT_HIGHLIGHT_COLOR,
  getAnnotationAnimationState,
  getStroke,
  getTextShadow,
} from '@/components/video-editor/annotationEffects';

// SVG path data for each arrow direction
const ARROW_PATHS: Record<ArrowDirection, string[]> = {
  'up': [
    'M 50 20 L 50 80',
    'M 50 20 L 35 35',
    'M 50 20 L 65 35',
  ],
  'down': [
    'M 50 20 L 50 80',
    'M 50 80 L 35 65',
    'M 50 80 L 65 65',
  ],
  'left': [
    'M 80 50 L 20 50',
    'M 20 50 L 35 35',
    'M 20 50 L 35 65',
  ],
  'right': [
    'M 20 50 L 80 50',
    'M 80 50 L 65 35',
    'M 80 50 L 65 65',
  ],
  'up-right': [
    'M 25 75 L 75 25',
    'M 75 25 L 60 30',
    'M 75 25 L 70 40',
  ],
  'up-left': [
    'M 75 75 L 25 25',
    'M 25 25 L 40 30',
    'M 25 25 L 30 40',
  ],
  'down-right': [
    'M 25 25 L 75 75',
    'M 75 75 L 70 60',
    'M 75 75 L 60 70',
  ],
  'down-left': [
    'M 75 25 L 25 75',
    'M 25 75 L 30 60',
    'M 25 75 L 40 70',
  ],
};

function parseSvgPath(pathString: string, scaleX: number, scaleY: number): Array<{ cmd: string; args: number[] }> {
  const commands: Array<{ cmd: string; args: number[] }> = [];
  const parts = pathString.trim().split(/\s+/);
  
  let i = 0;
  while (i < parts.length) {
    const cmd = parts[i];
    if (cmd === 'M' || cmd === 'L') {
      const x = parseFloat(parts[i + 1]) * scaleX;
      const y = parseFloat(parts[i + 2]) * scaleY;
      commands.push({ cmd, args: [x, y] });
      i += 3;
    } else {
      i++;
    }
  }
  
  return commands;
}


function renderArrow(
  ctx: CanvasRenderingContext2D,
  direction: ArrowDirection,
  color: string,
  strokeWidth: number,
  x: number,
  y: number,
  width: number,
  height: number,
  _scaleFactor: number
) {
  const paths = ARROW_PATHS[direction];
  if (!paths) return;

  ctx.save();
  ctx.translate(x, y);
  
  const padding = 8 * _scaleFactor;
  const availableWidth = Math.max(0, width - padding * 2);
  const availableHeight = Math.max(0, height - padding * 2);

  const scale = Math.min(availableWidth / 100, availableHeight / 100);
  
  const offsetX = padding + (availableWidth - 100 * scale) / 2;
  const offsetY = padding + (availableHeight - 100 * scale) / 2;
  
  // Apply centering offset
  ctx.translate(offsetX, offsetY);
  
  // Apply shadow filter
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 8 * scale; 
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4 * scale; 
  
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  // Draw all paths as a single shape to avoid overlapping shadows/strokes
  ctx.beginPath();
  
  for (const pathString of paths) {
    const commands = parseSvgPath(pathString, scale, scale);
    

    for (const { cmd, args } of commands) {
      if (cmd === 'M') {
        ctx.moveTo(args[0], args[1]);
      } else if (cmd === 'L') {
        ctx.lineTo(args[0], args[1]);
      }
    }
  }
  
  ctx.stroke();
  
  ctx.restore();
}


/** Canvas font for a run: bold runs are bold even in a regular-weight text. */
function canvasFont(style: AnnotationRegion['style'], bold: boolean, size: number) {
  const weight = bold || style.fontWeight === 'bold' ? 'bold' : 'normal';
  const italic = style.fontStyle === 'italic' ? 'italic' : 'normal';
  return `${italic} ${weight} ${size}px ${style.fontFamily}`;
}

function renderText(
  ctx: CanvasRenderingContext2D,
  annotation: AnnotationRegion,
  x: number,
  y: number,
  width: number,
  height: number,
  scaleFactor: number,
  animation: AnnotationAnimationState,
) {
  const text = getAnnotationText(annotation);
  if (!text.trim() || animation.opacity <= 0) return;
  const style = annotation.style;
  
  ctx.save();

  // Clip text to annotation box bounds (matches editor's overflow: hidden)
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();

  ctx.globalAlpha *= animation.opacity;
  ctx.translate(0, animation.offsetY * height);
  if (animation.scale !== 1) {
    ctx.translate(x + width / 2, y + height / 2);
    ctx.scale(animation.scale, animation.scale);
    ctx.translate(-(x + width / 2), -(y + height / 2));
  }

  const measure: MeasureText = (piece, bold, size) => {
    ctx.font = canvasFont(style, bold, size);
    return ctx.measureText(piece).width;
  };
  // Shrinks to fit the box like the editor does, so smaller frames (1:1, 9:16) keep the text whole.
  const scaledFontSize = fitFontSize({ text, fontSize: style.fontSize * scaleFactor, boxWidth: width, boxHeight: height, scale: scaleFactor, measure });
  // Baselines are placed like CSS line boxes (half-leading above the font's ascent), so
  // accents such as the dot of "İ" sit where the editor shows them.
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // Same box model as the editor (AnnotationOverlay): an 8 px padded flex box centres one
  // text block, which has 0.1em × 0.2em padding, line-height 1.4 and a single background.
  const containerPadding = 8 * scaleFactor;
  const innerWidth = Math.max(0, width - containerPadding * 2);
  const padX = scaledFontSize * 0.2;
  const padY = scaledFontSize * 0.1;
  const lines = layoutRichText(text, scaledFontSize, Math.max(0, innerWidth - padX * 2), measure);
  const lineHeight = scaledFontSize * 1.4;
  // The block is as wide as its longest unwrapped paragraph, or the whole box once text wraps.
  const longestParagraph = Math.max(0, ...text.split('\n').map((paragraph) => measureRichText(paragraph, scaledFontSize, measure)));
  const blockWidth = Math.min(innerWidth, longestParagraph + padX * 2);
  const blockHeight = lines.length * lineHeight + padY * 2;
  const blockX = style.textAlign === 'left' ? x + containerPadding : style.textAlign === 'right' ? x + width - containerPadding - blockWidth : x + width / 2 - blockWidth / 2;
  const blockY = y + height / 2 - blockHeight / 2;
  const contentX = blockX + padX;
  const contentWidth = blockWidth - padX * 2;
  const shadow = getTextShadow(style.textShadow);
  const stroke = getStroke(style);
  const highlightColor = style.highlightColor || DEFAULT_HIGHLIGHT_COLOR;

  if (style.backgroundColor && style.backgroundColor !== 'transparent' && longestParagraph > 0) {
    ctx.fillStyle = style.backgroundColor;
    ctx.beginPath();
    ctx.roundRect(blockX, blockY, blockWidth, blockHeight, 4 * scaleFactor);
    ctx.fill();
  }

  // Typewriter: characters are revealed in reading order, newlines included.
  const totalChars = lines.reduce((sum, line) => sum + line.reduce((count, token) => count + (token.newline ? 1 : token.text.length), 0), 0);
  let budget = animation.reveal >= 1 ? totalChars : Math.floor(totalChars * animation.reveal);

  ctx.font = canvasFont(style, false, scaledFontSize);
  const metrics = ctx.measureText('Hg');
  const ascent = metrics.fontBoundingBoxAscent || scaledFontSize * 0.9;
  const descent = metrics.fontBoundingBoxDescent || scaledFontSize * 0.25;
  const baselineOffset = (lineHeight - (ascent + descent)) / 2 + ascent;

  lines.forEach((line, index) => {
    const lineTop = blockY + padY + lineHeight * index;
    const currentY = lineTop + baselineOffset;
    const lineWidth = line.reduce((sum, token) => sum + token.width, 0);
    let lineX = contentX;
    if (style.textAlign === 'center') lineX = contentX + (contentWidth - lineWidth) / 2;
    else if (style.textAlign === 'right') lineX = contentX + contentWidth - lineWidth;

    let tokenX = lineX;
    for (const token of line) {
      if (token.newline) {
        budget -= 1;
        continue;
      }
      const shown = budget >= token.text.length ? token.text : token.text.slice(0, Math.max(0, budget));
      budget -= token.text.length;
      if (shown) {
        ctx.font = canvasFont(style, token.bold, scaledFontSize);
        if (shadow) {
          ctx.shadowColor = shadow.color;
          ctx.shadowBlur = shadow.blur * scaleFactor;
          ctx.shadowOffsetY = shadow.offsetY * scaleFactor;
        }
        if (stroke) {
          // Stroke under the fill, like CSS paint-order: stroke fill in the preview.
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = stroke.width * 2 * scaleFactor;
          ctx.lineJoin = 'round';
          ctx.strokeText(shown, tokenX, currentY);
          ctx.shadowColor = 'transparent';
        }
        ctx.fillStyle = token.highlight ? highlightColor : style.color;
        ctx.fillText(shown, tokenX, currentY);
        ctx.shadowColor = 'transparent';
      }
      tokenX += token.width;
    }
    
    if (style.textDecoration === 'underline' && lineWidth > 0) {
      const underlineY = currentY + scaledFontSize * 0.1;
      ctx.strokeStyle = style.color;
      ctx.lineWidth = Math.max(1, scaledFontSize / 16);
      ctx.beginPath();
      ctx.moveTo(lineX, underlineY);
      ctx.lineTo(lineX + lineWidth, underlineY);
      ctx.stroke();
    }
  });
  
  ctx.restore();
}

async function renderImage(
  ctx: CanvasRenderingContext2D,
  annotation: AnnotationRegion,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<void> {
  const source = getAnnotationImage(annotation);
  if (!source.startsWith('data:image')) {
    return;
  }
  
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Preserve aspect ratio - contain the image within the bounds
      const imgAspect = img.width / img.height;
      const boxAspect = width / height;
      
      let drawWidth = width;
      let drawHeight = height;
      let drawX = x;
      let drawY = y;
      
      if (imgAspect > boxAspect) {

        drawHeight = width / imgAspect;
        drawY = y + (height - drawHeight) / 2;
      } else {
        drawWidth = height * imgAspect;
        drawX = x + (width - drawWidth) / 2;
      }
      
      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
      resolve();
    };
    img.onerror = () => {
      console.error('[AnnotationRenderer] Failed to load image annotation');
      resolve();
    };
    img.src = source;
  });
}

export async function renderAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: AnnotationRegion[],
  canvasWidth: number,
  canvasHeight: number,
  currentTimeMs: number,
  scaleFactor: number = 1.0
): Promise<void> {
  // Filter active annotations at current time
  const activeAnnotations = annotations.filter(
    (ann) => currentTimeMs >= ann.startMs && currentTimeMs <= ann.endMs
  );
  
  // Sort by z-index (lower first, so higher z-index draws on top)
  const sortedAnnotations = [...activeAnnotations].sort((a, b) => a.zIndex - b.zIndex);
  
  for (const annotation of sortedAnnotations) {
    const x = (annotation.position.x / 100) * canvasWidth;
    const y = (annotation.position.y / 100) * canvasHeight;
    const width = (annotation.size.width / 100) * canvasWidth;
    const height = (annotation.size.height / 100) * canvasHeight;
    
    switch (annotation.type) {
      case 'text':
        renderText(ctx, annotation, x, y, width, height, scaleFactor, getAnnotationAnimationState(annotation, currentTimeMs));
        break;
        
      case 'image':
        await renderImage(ctx, annotation, x, y, width, height);
        break;
        
      case 'figure':
        if (annotation.figureData) {
          renderArrow(
            ctx,
            annotation.figureData.arrowDirection,
            annotation.figureData.color,
            annotation.figureData.strokeWidth,
            x,
            y,
            width,
            height,
            scaleFactor
          );
        }
        break;
    }
  }
}

