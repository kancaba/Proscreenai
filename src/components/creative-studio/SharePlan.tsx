import { useEffect, useState } from "react";
import {
	dayKey,
	formatShareTime,
	isOverdue,
	monthGrid,
	SHARE_PLATFORMS,
	type SharePost,
} from "../../lib/shareCalendar";
import type { Creation } from "./brand";

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const time = (at: number) =>
	new Date(at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
const platformLabel = (id: string) => SHARE_PLATFORMS.find((p) => p.id === id)?.label || id;

export function SharePlan({
	posts,
	creations,
	focusId,
	onEdit,
	onSave,
	onMessage,
}: {
	posts: SharePost[];
	creations: Creation[];
	focusId?: string;
	onEdit: (post: SharePost) => void;
	onSave: (post: SharePost) => Promise<void>;
	onMessage: (message: string) => void;
}) {
	const focused = posts.find((p) => p.id === focusId),
		[now, setNow] = useState(Date.now),
		[month, setMonth] = useState(() => {
			const d = new Date(focused?.scheduledAt ?? Date.now());
			return { year: d.getFullYear(), month: d.getMonth() };
		}),
		[selectedId, setSelectedId] = useState(focusId);
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 30_000);
		return () => clearInterval(timer);
	}, []);
	useEffect(() => {
		if (!focusId) return;
		setSelectedId(focusId);
		const post = posts.find((p) => p.id === focusId);
		if (post) {
			const d = new Date(post.scheduledAt);
			setMonth({ year: d.getFullYear(), month: d.getMonth() });
		}
	}, [focusId, posts]);
	const byDay = new Map<string, SharePost[]>();
	for (const post of posts)
		byDay.set(dayKey(post.scheduledAt), [...(byDay.get(dayKey(post.scheduledAt)) || []), post]);
	const today = dayKey(now),
		selected = posts.find((p) => p.id === selectedId),
		overdue = posts.filter((p) => isOverdue(p, now)),
		upcoming = posts.filter((p) => p.status === "planned" && p.scheduledAt > now),
		shared = posts
			.filter((p) => p.status === "shared")
			.sort((a, b) => b.scheduledAt - a.scheduledAt),
		image = (post: SharePost) => creations.find((c) => c.id === post.creationId);
	function shift(by: number) {
		setMonth(({ year, month }) => {
			const d = new Date(year, month + by, 1);
			return { year: d.getFullYear(), month: d.getMonth() };
		});
	}
	async function copy(action: () => Promise<unknown>, done: string) {
		try {
			await action();
			onMessage(done);
		} catch (e) {
			onMessage(e instanceof Error ? e.message : String(e));
		}
	}
	const row = (post: SharePost) => (
		<button
			key={post.id}
			className={`share-row ${post.id === selectedId ? "selected" : ""} ${post.status}`}
			onClick={() => setSelectedId(post.id)}
		>
			{(image(post)?.src ?? post.thumbnail) ? (
				<img src={image(post)?.src ?? post.thumbnail} alt="" />
			) : (
				<i className="share-row-empty" />
			)}
			<span>
				<strong>{formatShareTime(post.scheduledAt)}</strong>
				<small>
					{post.platforms.map(platformLabel).join(" · ") || "Platform seçilmedi"} — {post.title}
				</small>
			</span>
		</button>
	);
	const creation = selected && image(selected);
	return (
		<div className="share-plan">
			<section className="share-calendar" aria-label="Paylaşım takvimi">
				<header>
					<button aria-label="Önceki ay" onClick={() => shift(-1)}>
						‹
					</button>
					<h2>
						{new Date(month.year, month.month, 1).toLocaleDateString("tr-TR", {
							month: "long",
							year: "numeric",
						})}
					</h2>
					<button aria-label="Sonraki ay" onClick={() => shift(1)}>
						›
					</button>
					<button
						onClick={() => {
							const d = new Date();
							setMonth({ year: d.getFullYear(), month: d.getMonth() });
						}}
					>
						Bugün
					</button>
				</header>
				<div className="share-grid">
					{WEEKDAYS.map((d) => (
						<b key={d}>{d}</b>
					))}
					{monthGrid(month.year, month.month).map((day) => {
						const key = dayKey(day),
							items = byDay.get(key) || [];
						return (
							<div
								key={key}
								data-day={key}
								className={`share-day ${day.getMonth() !== month.month ? "outside" : ""} ${key === today ? "today" : ""}`}
							>
								<span>{day.getDate()}</span>
								{items.map((post) => (
									<button
										key={post.id}
										className={`share-pill ${post.status} ${isOverdue(post, now) ? "overdue" : ""} ${post.id === selectedId ? "selected" : ""}`}
										aria-label={`${formatShareTime(post.scheduledAt)} ${post.title}`}
										onClick={() => setSelectedId(post.id)}
									>
										{(post.thumbnail ?? image(post)?.src) && (
											<img src={post.thumbnail ?? image(post)?.src} alt="" />
										)}
										{time(post.scheduledAt)}
									</button>
								))}
							</div>
						);
					})}
				</div>
			</section>
			<aside className="share-side">
				{selected ? (
					<article className="share-detail" aria-label="Seçili paylaşım">
						{creation ? (
							<img src={creation.src} alt={creation.prompt || creation.name} />
						) : (
							<div className="share-missing">Görsel galeride bulunamadı</div>
						)}
						<small>
							{selected.status === "shared"
								? `✓ Paylaşıldı${selected.sharedAt ? ` · ${formatShareTime(selected.sharedAt)}` : ""}`
								: isOverdue(selected, now)
									? "Zamanı geçti, henüz paylaşılmadı"
									: "Planlandı"}
						</small>
						<h3>{formatShareTime(selected.scheduledAt)}</h3>
						<p className="share-platforms">
							{selected.platforms.map(platformLabel).join(" · ") || "Platform seçilmedi"}
						</p>
						{selected.caption && <pre>{selected.caption}</pre>}
						<div className="share-actions">
							{creation && (
								<a href={creation.src} download={`screenmovie-${creation.id}.png`}>
									Görseli indir ↓
								</a>
							)}
							{creation && (
								<button
									onClick={() =>
										void copy(
											() => window.electronAPI.shareCalendarCopyImage(creation.src),
											"Görsel panoya kopyalandı.",
										)
									}
								>
									Görseli kopyala
								</button>
							)}
							{selected.caption && (
								<button
									onClick={() =>
										void copy(
											() => window.electronAPI.shareCalendarCopyText(selected.caption),
											"Paylaşım metni kopyalandı.",
										)
									}
								>
									Metni kopyala
								</button>
							)}
							{selected.platforms.map((id) => (
								<button
									key={id}
									onClick={() =>
										void window.electronAPI.openExternalUrl(
											SHARE_PLATFORMS.find((p) => p.id === id)?.url || "",
										)
									}
								>
									{platformLabel(id)} aç ↗
								</button>
							))}
						</div>
						<footer>
							<button
								className={selected.status === "planned" ? "creative-primary" : ""}
								onClick={() =>
									void onSave(
										selected.status === "planned"
											? { ...selected, status: "shared", sharedAt: Date.now() }
											: { ...selected, status: "planned", sharedAt: undefined },
									).catch((e) => onMessage(String(e)))
								}
							>
								{selected.status === "planned"
									? "✓ Paylaşıldı olarak işaretle"
									: "Paylaşılmadı olarak işaretle"}
							</button>
							<button onClick={() => onEdit(selected)}>Düzenle</button>
						</footer>
					</article>
				) : (
					<div className="share-hint">
						<strong>{posts.length ? "Bir paylaşım seç" : "Takvimin boş"}</strong>
						<p>
							{posts.length
								? "Takvimden ya da listeden bir paylaşım seçince görseli, metni ve paylaşım araçlarını burada görürsün."
								: "Galeride bir görselin altındaki “Takvime ekle” ile paylaşım tarihini belirle. Zamanı yaklaşınca hatırlatırız."}
						</p>
					</div>
				)}
				{overdue.length > 0 && (
					<section className="share-list overdue" aria-label="Zamanı geçen paylaşımlar">
						<h3>Zamanı geçenler · {overdue.length}</h3>
						{overdue.map(row)}
					</section>
				)}
				<section className="share-list" aria-label="Yaklaşan paylaşımlar">
					<h3>Yaklaşan paylaşımlar · {upcoming.length}</h3>
					{upcoming.length ? upcoming.map(row) : <p>Planlanmış paylaşım yok.</p>}
				</section>
				{shared.length > 0 && (
					<details className="share-list">
						<summary>Paylaşılanlar · {shared.length}</summary>
						{shared.map(row)}
					</details>
				)}
			</aside>
		</div>
	);
}
