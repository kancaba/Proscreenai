export function wrapLines(
	text: string,
	width: number,
	measure: (text: string) => number,
): string[] {
	const lines: string[] = [];
	for (const paragraph of text.split("\n")) {
		let line = "";
		for (const token of paragraph.split(/(\s+)/).filter(Boolean)) {
			if (measure(line + token) <= width) {
				line += token;
				continue;
			}
			if (line.trim()) {
				lines.push(line.trimEnd());
				line = "";
			}
			if (measure(token) <= width) {
				line = token.trimStart();
				continue;
			}
			for (const char of token.trimStart()) {
				if (line && measure(line + char) > width) {
					lines.push(line);
					line = "";
				}
				line += char;
			}
		}
		lines.push(line.trimEnd());
	}
	return lines;
}
export function snap(value: number, targets: number[], threshold: number) {
	const t = targets.find((t) => Math.abs(value - t) <= threshold);
	return t ?? value;
}
