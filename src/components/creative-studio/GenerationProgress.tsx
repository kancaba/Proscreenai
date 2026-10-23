import { useEffect, useState } from "react";
const steps = ["Hazırlık", "Bağlantı", "AI üretimi", "Görseli al"];
export function GenerationProgress({
	stage,
	detail,
	startedAt,
}: {
	stage: string;
	detail: string;
	startedAt: number;
}) {
	const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - startedAt) / 1000));
	useEffect(() => {
		const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
		return () => clearInterval(timer);
	}, [startedAt]);
	const index = /receiving|image/.test(stage)
		? 3
		: /generating|running|message/.test(stage)
			? 2
			: /connecting/.test(stage)
				? 1
				: 0;
	return (
		<div className="creative-progress" aria-label="Görsel üretim durumu">
			<div className="creative-progress-art" aria-hidden="true">
				<i />
				<i />
				<i />
				<span>✦</span>
			</div>
			<div className="creative-progress-content">
				<header>
					<strong>{steps[index]}</strong>
					<time>
						{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
					</time>
				</header>
				<div className="creative-progress-track" aria-hidden="true">
					<span />
				</div>
				<ol>
					{steps.map((step, i) => (
						<li key={step} className={i === index ? "current" : i < index ? "done" : ""}>
							{i < index ? "✓" : i + 1} {step}
						</li>
					))}
				</ol>
				<p role="status">{detail || "AI isteği işleniyor…"}</p>
				<small>
					Süre sağlayıcının yanıtına bağlıdır; aşama göstergesi tahmini yüzde kullanmaz.
				</small>
			</div>
		</div>
	);
}
