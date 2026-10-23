import { useMemo } from "react";
import type { Layer } from "./document";
import { wrapLines } from "./layout";
export function LayerArtwork({ layer: l }: { layer: Layer }) {
	const lines = useMemo(() => {
		if (l.kind !== "text") return [];
		const c = document.createElement("canvas").getContext("2d");
		if (!c) return l.text.split("\n");
		c.font = `${l.italic ? "italic " : ""}${l.bold ? "700" : "400"} ${l.fontSize}px "${l.font.replace(/["\\]/g, "")}"`;
		return wrapLines(
			l.text,
			l.width,
			(t) => c.measureText(t).width + Math.max(0, t.length - 1) * (l.letterSpacing ?? 0),
		);
	}, [l.kind, l.text, l.width, l.font, l.fontSize, l.bold, l.italic, l.letterSpacing]);
	const crop = l.crop ?? { x: 0, y: 0, width: 1000, height: 1000 },
		radius = l.mask === "ellipse" ? Math.min(l.width, l.height) / 2 : 0;
	return (
		<g
			transform={`translate(${l.flipX ? l.width : 0} ${l.flipY ? l.height : 0}) scale(${l.flipX ? -1 : 1} ${l.flipY ? -1 : 1})`}
		>
			<defs>
				<clipPath id={`clip-${l.id}`}>
					{radius ? (
						<ellipse cx={l.width / 2} cy={l.height / 2} rx={l.width / 2} ry={l.height / 2} />
					) : (
						<rect width={l.width} height={l.height} />
					)}
				</clipPath>
				<filter id={`shadow-${l.id}`} x="-50%" y="-50%" width="200%" height="200%">
					<feDropShadow dx="3" dy="6" stdDeviation="8" floodColor="#000000" floodOpacity=".35" />
				</filter>
			</defs>
			<g filter={l.shadow ? `url(#shadow-${l.id})` : undefined}>
				{l.kind === "image" ? (
					<g clipPath={`url(#clip-${l.id})`}>
						<svg
							width={l.width}
							height={l.height}
							viewBox={`${crop.x} ${crop.y} ${crop.width} ${crop.height}`}
							preserveAspectRatio="none"
						>
							<image href={l.src} width="1000" height="1000" preserveAspectRatio="none" />
						</svg>
					</g>
				) : l.kind === "text" ? (
					<g clipPath={`url(#clip-${l.id})`}>
						<text
							fill={l.color}
							fontFamily={l.font}
							fontSize={l.fontSize}
							fontWeight={l.bold ? 700 : 400}
							fontStyle={l.italic ? "italic" : "normal"}
							textDecoration={l.underline ? "underline" : undefined}
							letterSpacing={l.letterSpacing ?? 0}
							textAnchor={l.align === "center" ? "middle" : l.align === "right" ? "end" : "start"}
							stroke={l.strokeColor ?? "#ffffff"}
							strokeWidth={l.strokeWidth ?? 0}
							paintOrder="stroke fill"
						>
							{lines.map((line, i) => (
								<tspan
									key={i}
									x={l.align === "center" ? l.width / 2 : l.align === "right" ? l.width : 0}
									y={l.fontSize + i * l.fontSize * (l.lineHeight ?? 1.25)}
								>
									{line}
								</tspan>
							))}
						</text>
					</g>
				) : l.kind === "ellipse" ? (
					<ellipse
						cx={l.width / 2}
						cy={l.height / 2}
						rx={l.width / 2}
						ry={l.height / 2}
						fill={l.color}
						stroke={l.strokeColor}
						strokeWidth={l.strokeWidth ?? 0}
					/>
				) : l.kind === "arrow" ? (
					<path
						d={`M0 ${l.height / 2} H${l.width} M${l.width * 0.65} ${l.height * 0.15} L${l.width} ${l.height / 2} L${l.width * 0.65} ${l.height * 0.85}`}
						fill="none"
						stroke={l.color}
						strokeWidth={l.strokeWidth || Math.max(4, l.height * 0.055)}
					/>
				) : (
					<rect
						width={l.width}
						height={l.height}
						rx={l.cornerRadius ?? 0}
						fill={l.color}
						stroke={l.strokeColor}
						strokeWidth={l.strokeWidth ?? 0}
					/>
				)}
			</g>
		</g>
	);
}
