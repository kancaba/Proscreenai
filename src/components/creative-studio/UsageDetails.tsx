import type { ImageUsage } from "../../lib/imageUsage";
export function UsageDetails({ usage, durationMs }: { usage?: ImageUsage; durationMs?: number }) {
	const fmt = (n?: number) => (n === undefined ? "Bildirilmiyor" : n.toLocaleString("tr-TR"));
	return (
		<details className="creative-usage">
			<summary>
				{usage?.totalTokens !== undefined
					? `${fmt(usage.totalTokens)} token`
					: "Token bilgisi bildirilmedi"}
				{durationMs !== undefined ? ` · ${Math.round(durationMs / 1000)} sn` : ""}
			</summary>
			{usage ? (
				<>
					<dl>
						<div>
							<dt>Girdi</dt>
							<dd>{fmt(usage.inputTokens)}</dd>
						</div>
						{usage.inputTokens !== undefined && usage.cachedTokens !== undefined && <div><dt>Yeni girdi (önbellek hariç)</dt><dd>{fmt(Math.max(0, usage.inputTokens - usage.cachedTokens))}</dd></div>}
						<div>
							<dt>Çıktı</dt>
							<dd>{fmt(usage.outputTokens)}</dd>
						</div>
						<div>
							<dt>Önbellekten (girdiye dahil)</dt>
							<dd>{fmt(usage.cachedTokens)}</dd>
						</div>
						{usage.reasoningTokens !== undefined && (
							<div>
								<dt>Akıl yürütme</dt>
								<dd>{fmt(usage.reasoningTokens)}</dd>
							</div>
						)}
					</dl>
					<p>
						{usage.scope === "agent"
							? "Codex oturumunun raporladığı kullanım. Görsel aracının ayrı tüketimini içermeyebilir."
							: "Gemini API’nin bu istek için raporladığı kullanım."}{" "}
						Toplama önbellekten okunan girdi de dahildir; bu sayı hesap kotası veya ücret değildir.
					</p>
				</>
			) : (
				<p>
					Sağlayıcı bu işlem için kullanım raporu göndermedi veya bu eski üretimde ölçüm
					kaydedilmedi.
				</p>
			)}
		</details>
	);
}
