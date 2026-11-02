// Isolated desktop test for the Creative Studio "Plan" tab and share reminders.
// Run after `npx vite build`: `npx electron scripts/share-calendar-test.cjs`
// No network or social media account is used; notifications are captured instead of shown.
const { app, BrowserWindow, Notification, clipboard, powerMonitor } = require("electron"),
	fs = require("node:fs/promises"),
	path = require("node:path"),
	{ pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, ".."),
	userData = path.join("/private/tmp", "screenmovie-share-calendar-test-" + Date.now()),
	calendarFile = path.join(userData, "share-calendar.json");
app.setPath("userData", userData);
app.getAppPath = () => root;
// Fake clock for the main process: reminders see this time, the renderer keeps the real one.
const realNow = Date.now;
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;
const notices = [];
Notification.prototype.show = function () {
	notices.push(this);
	console.log("NOTIFY", JSON.stringify(this.title), JSON.stringify(this.body));
};
let win;
const checks = [],
	delay = (ms) => new Promise((r) => setTimeout(r, ms)),
	run = (s) => win.webContents.executeJavaScript(s, true);
async function wait(f, tries = 150) {
	for (let i = 0; i < tries; i++) {
		if (await f()) return;
		await delay(100);
	}
	throw Error("Timeout");
}
function check(name, value) {
	checks.push({ name, passed: !!value });
	console.log(value ? "PASS" : "FAIL", name);
	if (!value) throw Error(name);
}
async function click(name, scope = "document") {
	await run(
		`Array.from(${scope}.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(name)}).click()`,
	);
	await delay(120);
}
async function field(label, value) {
	await run(
		`(()=>{const n=document.querySelector('[aria-label=${JSON.stringify(label)}]');Object.getOwnPropertyDescriptor(n.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}))})()`,
	);
	await delay(120);
}
const readCalendar = async () => JSON.parse(await fs.readFile(calendarFile, "utf8")).posts;
const pad = (n) => String(n).padStart(2, "0"),
	localInput = (d) =>
		`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
	dayKey = (d) => localInput(d).slice(0, 10);
(async () => {
	// A reminder that came due while the app was fully closed.
	await fs.mkdir(userData, { recursive: true });
	await fs.writeFile(
		calendarFile,
		JSON.stringify({
			version: 1,
			posts: [
				{
					id: "missed-post",
					creationId: "deleted-creation",
					title: "Eski kampanya",
					scheduledAt: realNow() - 2 * 3600e3,
					platforms: ["instagram"],
					caption: "",
					reminders: [0],
					sentReminders: [],
					status: "planned",
					createdAt: realNow() - 86400e3,
					updatedAt: realNow() - 86400e3,
				},
			],
		}),
	);
	await import(pathToFileURL(path.join(root, "dist-electron/main.js")).href);
	await app.whenReady();
	await wait(() => {
		win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("welcome"));
		return win;
	});
	await wait(() => run("!!window.electronAPI"));
	await wait(() => notices.length === 1);
	check(
		"Reminder missed while the app was closed is reported at launch",
		notices[0].title === "Kaçırılan 1 paylaşım hatırlatması" &&
			notices[0].body.includes("Eski kampanya"),
	);
	check("Missed reminder is not repeated", (await readCalendar())[0].sentReminders.includes(0));

	const image =
		"data:image/png;base64," +
		(await fs.readFile(path.join(root, "public/app-icons/screenmovie-128.png"))).toString("base64");
	await run(
		`new Promise((resolve,reject)=>{const r=indexedDB.open('screenmovie-creative-library',1);r.onupgradeneeded=()=>{r.result.createObjectStore('brands',{keyPath:'id'});r.result.createObjectStore('creations',{keyPath:'id'})};r.onsuccess=()=>{const tx=r.result.transaction('creations','readwrite');tx.objectStore('creations').put({id:'creation-1',name:'Kasım görseli',src:${JSON.stringify(image)},prompt:'Kasım kampanyası LinkedIn görseli',brandId:'',productId:'',createdAt:Date.now(),width:128,height:128});tx.oncomplete=()=>{r.result.close();resolve(true)};tx.onerror=()=>reject(tx.error)};r.onerror=()=>reject(r.error)})`,
	);
	await run(`window.dispatchEvent(new CustomEvent('open-image-studio',{detail:{gallery:true}}))`);
	await wait(() => run(`document.querySelectorAll('.creative-result').length===1`));

	// Schedule from the gallery card.
	await click("Takvime ekle", `document.querySelector('.creative-result')`);
	await wait(() => run(`!!document.querySelector('.share-schedule-dialog[open]')`));
	check(
		"Default reminders are one day before and on time",
		(await run(
			`JSON.stringify(Array.from(document.querySelectorAll('.share-schedule-dialog fieldset:last-of-type input')).map(i=>i.checked))`,
		)) === "[true,false,false,true]",
	);
	const when = new Date(realNow() + 10 * 86400e3);
	when.setHours(10, 0, 0, 0);
	await field("Paylaşım zamanı", localInput(when));
	await run(
		`Array.from(document.querySelectorAll('.share-chip')).find(l=>l.textContent.trim()==='Instagram').querySelector('input').click()`,
	);
	await field("Paylaşım metni", "Yeni ürünümüz yayında! #kampanya");
	await fs.writeFile(
		path.join(root, "artifacts/share-calendar-dialog.png"),
		(await win.webContents.capturePage()).toPNG(),
	);
	await click("Takvime ekle", `document.querySelector('.share-schedule-dialog')`);
	await wait(() => run(`!document.querySelector('.share-schedule-dialog')`));
	let saved = (await readCalendar()).find((p) => p.creationId === "creation-1");
	check(
		"Entry is stored by the main process with platforms, text and reminders",
		saved &&
			saved.scheduledAt === when.getTime() &&
			saved.platforms.join() === "linkedin,instagram" &&
			saved.caption.includes("#kampanya") &&
			saved.reminders.join() === "1440,0" &&
			saved.thumbnail?.startsWith("data:image/jpeg"),
	);
	check(
		"Gallery card shows the planned date",
		await run(`!!document.querySelector('.creative-result .share-badge')`),
	);

	// Plan tab: month view, detail and share-time actions.
	await click("◷ Plan");
	await wait(() => run(`!!document.querySelector('.share-plan')`));
	await run(
		`(async()=>{for(let i=0;i<3&&!document.querySelector('[data-day="${dayKey(when)}"] .share-pill');i++){document.querySelector('[aria-label="Sonraki ay"]').click();await new Promise(r=>setTimeout(r,80))}})()`,
	);
	check(
		"Month view places the entry on its day",
		await run(`!!document.querySelector('[data-day="${dayKey(when)}"] .share-pill')`),
	);
	check(
		"Upcoming and overdue lists are shown",
		await run(
			`document.querySelector('[aria-label="Yaklaşan paylaşımlar"]').textContent.includes('Yaklaşan paylaşımlar · 1')&&document.querySelector('[aria-label="Zamanı geçen paylaşımlar"]').textContent.includes('Eski kampanya')`,
		),
	);
	await run(`document.querySelector('[data-day="${dayKey(when)}"] .share-pill').click()`);
	await delay(150);
	clipboard.clear();
	await click("Metni kopyala");
	await wait(() => clipboard.readText() === "Yeni ürünümüz yayında! #kampanya");
	check("Share text is copied", true);
	await click("Görseli kopyala");
	await wait(() => !clipboard.readImage().isEmpty());
	check("Image is copied to the clipboard", clipboard.readImage().getSize().width === 128);
	check(
		"Image can be downloaded",
		await run(`!!document.querySelector('.share-actions a[download]')`),
	);
	await fs.writeFile(
		path.join(root, "artifacts/share-calendar-plan.png"),
		(await win.webContents.capturePage()).toPNG(),
	);
	await click("✓ Paylaşıldı olarak işaretle");
	await wait(async () => (await readCalendar()).find((p) => p.id === saved.id).status === "shared");
	check(
		"Entry can be marked as shared",
		await run(`document.querySelector('.share-detail').textContent.includes('✓ Paylaşıldı')`),
	);
	await click("Paylaşılmadı olarak işaretle");
	await wait(
		async () => (await readCalendar()).find((p) => p.id === saved.id).status === "planned",
	);

	// Edit time and text.
	await click("Düzenle", `document.querySelector('.share-detail')`);
	await wait(() => run(`!!document.querySelector('.share-schedule-dialog[open]')`));
	const moved = new Date(when.getTime() + 86400e3);
	moved.setHours(14, 30, 0, 0);
	await field("Paylaşım zamanı", localInput(moved));
	await field("Paylaşım metni", "Güncellenmiş metin");
	await click("Değişiklikleri kaydet");
	await wait(() => run(`!document.querySelector('.share-schedule-dialog')`));
	saved = (await readCalendar()).find((p) => p.id === saved.id);
	check(
		"Entry can be edited",
		saved.scheduledAt === moved.getTime() &&
			saved.caption === "Güncellenmiş metin" &&
			(await run(`!!document.querySelector('[data-day="${dayKey(moved)}"] .share-pill')`)),
	);

	// Fake clock: the computer sleeps and wakes up one day before the share.
	const before = notices.length;
	clockOffset = moved.getTime() - 86400e3 + 60e3 - realNow();
	powerMonitor.emit("resume");
	await wait(() => notices.length === before + 1);
	check(
		"One-day reminder fires after waking up on the fake clock",
		notices.at(-1).title === "1 gün sonra paylaşım · LinkedIn, Instagram",
	);
	clockOffset = 0;

	// Real timer: a share due in two seconds, then the notification click opens the Plan entry.
	await run(`document.querySelector('.creative-top nav button').click()`);
	const soon = await run(
		`window.electronAPI.shareCalendarSave({id:'soon-post',creationId:'creation-1',title:'Hemen paylaş',scheduledAt:Date.now()+2000,platforms:['linkedin'],caption:'',reminders:[0],sentReminders:[],status:'planned',createdAt:Date.now(),updatedAt:Date.now()})`,
	);
	await wait(() => notices.some((n) => n.title.startsWith("Paylaşım zamanı geldi")), 80);
	check("On-time reminder fires from the timer", soon.id === "soon-post");
	notices.find((n) => n.title.startsWith("Paylaşım zamanı geldi")).emit("click");
	await wait(() =>
		run(
			`!!document.querySelector('.share-detail')&&document.querySelector('.share-row.selected')?.textContent.includes('Hemen paylaş')`,
		),
	);
	check("Notification click opens the Plan tab on that entry", true);

	// Delete, then make sure everything survives a reload.
	await run(
		`Array.from(document.querySelectorAll('.share-row')).find(r=>r.textContent.includes('Hemen paylaş')).click()`,
	);
	await delay(100);
	await click("Düzenle", `document.querySelector('.share-detail')`);
	await click("Sil", `document.querySelector('.share-schedule-dialog')`);
	await click("Takvimden sil");
	await wait(() => run(`!document.querySelector('.share-schedule-dialog')`));
	check(
		"Entry can be deleted",
		!(await readCalendar()).some((p) => p.id === "soon-post") &&
			(await run(
				`!Array.from(document.querySelectorAll('.share-row')).some(r=>r.textContent.includes('Hemen paylaş'))`,
			)),
	);
	await win.webContents.reload();
	await wait(() => run('!!window.electronAPI&&!!document.querySelector(".studio-mode-choice")'));
	await run(`window.dispatchEvent(new CustomEvent('open-image-studio',{detail:{gallery:true}}))`);
	await wait(() => run(`!!document.querySelector('.creative-result .share-badge')`));
	check(
		"Calendar survives a reload",
		(await readCalendar())
			.map((p) => p.id)
			.sort()
			.join() === ["missed-post", saved.id].sort().join(),
	);
	await fs.writeFile(
		path.join(root, "artifacts/share-calendar-report.json"),
		JSON.stringify(
			{
				checks,
				note: "Isolated desktop test. Notifications captured; main-process clock faked for the sleep case; no network or social account.",
			},
			null,
			2,
		),
	);
	app.exit(0);
})().catch(async (e) => {
	console.error(e);
	if (win && !win.isDestroyed()) {
		console.error(await run("document.body.innerText"));
		await fs.writeFile(
			path.join(root, "artifacts/share-calendar-failure.png"),
			(await win.webContents.capturePage()).toPNG(),
		);
	}
	await fs.writeFile(
		path.join(root, "artifacts/share-calendar-report.json"),
		JSON.stringify({ checks, error: String(e) }, null, 2),
	);
	app.exit(1);
});
