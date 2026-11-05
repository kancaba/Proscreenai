import { useState } from "react";
import { calculateOutputDimensions } from "@/lib/exporter/gifExporter";
import { GIF_SIZE_PRESETS } from "@/lib/exporter/types";
import { type Sequence, type SequenceOutput, defaultSequenceOutput } from "@/lib/sequence";
import { ExportSetupDialog } from "./ExportSetupDialog";

export function SequenceExportDialog({
	sequence,
	close,
	start,
}: {
	sequence: Sequence;
	close: () => void;
	start: (settings: SequenceOutput, fps: 30 | 60) => void;
}) {
	const [settings, set] = useState<SequenceOutput>(
		sequence.output ?? {
			...defaultSequenceOutput,
			customWidth: Math.max(64, Math.min(4096, sequence.width)),
			customHeight: Math.max(64, Math.min(4096, sequence.height)),
		},
	);
	const [fps, setFps] = useState(sequence.fps ?? 30);
	const patch = (change: Partial<SequenceOutput>) => set((s) => ({ ...s, ...change }));
	const gifSize = calculateOutputDimensions(
		sequence.width,
		sequence.height,
		settings.gifSize,
		GIF_SIZE_PRESETS,
	);
	return (
		<ExportSetupDialog
			open
			onOpenChange={(open) => {
				if (!open) close();
			}}
			onStart={() => start(settings, fps)}
			selected=""
			onWallpaperChange={() => {}}
			sourceSize={sequence}
			aspectRatio={`${sequence.width}:${sequence.height}`}
			exportFormat={settings.format}
			onExportFormatChange={(format) => patch({ format })}
			exportQuality={settings.quality}
			onExportQualityChange={(quality) => patch({ quality })}
			exportResolution={settings.resolution}
			onExportResolutionChange={(resolution) => patch({ resolution })}
			exportFps={fps}
			onExportFpsChange={setFps}
			exportCustomWidth={settings.customWidth}
			exportCustomHeight={settings.customHeight}
			onExportCustomSizeChange={(customWidth, customHeight) => patch({ customWidth, customHeight })}
			gifFrameRate={settings.gifFps}
			onGifFrameRateChange={(gifFps) => patch({ gifFps })}
			gifSizePreset={settings.gifSize}
			onGifSizePresetChange={(gifSize) => patch({ gifSize })}
			gifLoop={settings.loop}
			onGifLoopChange={(loop) => patch({ loop })}
			gifOutputDimensions={gifSize}
		/>
	);
}
