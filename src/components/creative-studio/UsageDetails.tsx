import type { ImageUsage } from "../../lib/imageUsage";
export function UsageDetails({ usage, durationMs }: { usage?: ImageUsage; durationMs?: number }) {
	const fmt = (n?: number) => (n === undefined ? "Bildirilmiyor" : n.toLocaleString("tr-TR"));
	if (usage?.provider === "byteplus")
		return (
			<details className="creative-usage">
				<summary>
					{fmt(usage.generatedImages)} görsel
					{usage.estimatedCostUSD !== undefined
						? ` · Tahmini $${usage.estimatedCostUSD.toFixed(3)} USD`
						: ""}
					{durationMs !== undefined ? ` · ${Math.round(durationMs / 1000)} sn` : ""}
				</summary>
				<dl>
					<div>
						<dt>Model</dt>
						<dd>{usage.model || "Bildirilmiyor"}</dd>
					</div>
					<div>
						<dt>Üretilen görsel</dt>
						<dd>{fmt(usage.generatedImages)}</dd>
					</div>
					<div>
						<dt>Raporlanan çıktı tokenı</dt>
						<dd>{fmt(usage.outputTokens)}</dd>
					</div>
					<div>
						<dt>Raporlanan toplam token</dt>
						<dd>{fmt(usage.totalTokens)}</dd>
					</div>
				</dl>
				<p>
					BytePlus görsel tarifesine göre tahmini bedel; kesin fatura veya kalan kredi değildir.
					Token sayısı doğrudan ücret hesabı değildir. Fiyat tarihi:{" "}
					{usage.priceDate || "Bilinmiyor"}.
				</p>
			</details>
		);
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
						{usage.inputTokens !== undefined && usage.cachedTokens !== undefined && (
							<div>
								<dt>Yeni girdi (önbellek hariç)</dt>
								<dd>{fmt(Math.max(0, usage.inputTokens - usage.cachedTokens))}</dd>
							</div>
						)}
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
