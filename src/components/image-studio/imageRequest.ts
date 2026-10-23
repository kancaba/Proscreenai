export function inferImageFormat(request: string, width: number, height: number) {
	if (/(?:9\s*[:/]\s*16|\bstory\b|\breels?\b|\bsnapchat\b)/i.test(request))
		return { width: 1080, height: 1920 };
	if (/4\s*[:/]\s*5|instagram\s+(?:post|gönderi)/i.test(request))
		return { width: 1080, height: 1350 };
	if (/16\s*[:/]\s*9|youtube\s*(?:kapak|thumbnail)/i.test(request))
		return { width: 1920, height: 1080 };
	if (/1\s*[:/]\s*1|\bkare\b/i.test(request)) return { width: 1080, height: 1080 };
	return { width, height };
}
export function inferImageMode(
	request: string,
	hasSource: boolean,
	hasGeneratedSource: boolean,
): "edit" | "generate" {
	return hasSource &&
		(/değiştir|düzelt|kaldır|iyileştir|arka plan[ıi]|rengini|\bedit\b|\bremove\b|\bchange\b/i.test(
			request,
		) ||
			(hasGeneratedSource && !/sıfırdan|yeni (?:bir )?görsel|new image/i.test(request)))
		? "edit"
		: "generate";
}
