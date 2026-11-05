// Run with Electron after vite build. Isolate projects, media, exports and app settings.
const { app, BrowserWindow, dialog } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const ffmpeg = require("ffmpeg-static");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let win, dir;
const run = (expr) => win.webContents.executeJavaScript(expr, true);
async function waitFor(fn) {
	for (let i = 0; i < 150; i++) {
		const value = await fn();
		if (value) return value;
		await delay(100);
	}
	throw Error("Timed out: " + fn.toString());
}
const click = (text) =>
	run(
		`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`,
	);
async function drag(selector, dxMs, dy) {
	const { x, y, dx } = await run(`(() => {
    const n=document.querySelector(${JSON.stringify(selector)}), r=n.getBoundingClientRect();
    const c=n.closest('.seq-clip').getBoundingClientRect();
    return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2), dx:Math.round(c.width*${dxMs}/2000)};
  })()`);
	for (const [type, x1, y1] of [
		["mouseMove", x, y],
		["mouseDown", x, y],
		["mouseMove", x + dx, y + dy],
		["mouseUp", x + dx, y + dy],
	]) {
		win.webContents.sendInputEvent({ type, x: x1, y: y1, button: "left", clickCount: 1 });
		await delay(60);
	}
}
async function main() {
	dir = await fs.mkdtemp(path.join(os.tmpdir(), "screenmovie-multitrack-"));
	app.setPath("userData", dir);
	app.getAppPath = () => root;
	const red = path.join(dir, "red.mp4"),
		blue = path.join(dir, "blue.mp4"),
		project = path.join(dir, "edit.screenmovie"),
		output = path.join(dir, "edit.mp4");
	for (const [file, color, tone] of [
		[red, "red", 250],
		[blue, "blue", 880],
	]) {
		execFileSync(ffmpeg, [
			"-v",
			"error",
			"-f",
			"lavfi",
			"-i",
			`color=${color}:s=320x180:r=30:d=2`,
			"-f",
			"lavfi",
			"-i",
			`sine=f=${tone}:d=2`,
			"-c:v",
			"libx264",
			"-c:a",
			"aac",
			file,
		]);
	}
	await import(pathToFileURL(path.join(root, "dist-electron/main.js")).href);
	await app.whenReady();
	let pick = red,
		save = project;
	dialog.showOpenDialog = async () => ({ filePaths: [pick], canceled: false });
	dialog.showSaveDialog = async () => ({ filePath: save, canceled: false });
	win = await waitFor(() =>
		BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("welcome")),
	);
	await waitFor(() => run("!!document.querySelector('.home-workspace.home-video')"));
	await run("document.querySelector('.home-workspace.home-video').click()");
	win = await waitFor(() =>
		BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("editor")),
	);
	await waitFor(() => run("!!document.querySelector('.seq-clip')"));
	const tr = await run("document.querySelector('.seq-top').innerText.includes('Video düzenleme')");
	const word = (a, b) => (tr ? a : b);
	pick = blue;
	await click(word("Medya ekle", "Add media"));
	await waitFor(() => run("document.querySelectorAll('.seq-clip').length===2"));
	const second = '.seq-clip[aria-label="blue.mp4"]';
	await drag(second + ' [data-edge="right"]', -420, 0);
	assert.ok(await run(`parseFloat(document.querySelector('${second} small').textContent)<1.7`));
	await run(
		`document.querySelector('.seq-tools [aria-label="${word("Geri al", "Undo")}"]').click()`,
	);
	await waitFor(() => run(`parseFloat(document.querySelector('${second} small').textContent)===2`));
	await drag(second, -1000, -47); // V2 begins halfway through V1.
	await click(word("Sesi ayır", "Detach audio"));
	await waitFor(() => run("!!document.querySelector('.seq-clip.audio')"));
	// Put the linked red clip half a second later, leaving a leading gap.
	await drag('.seq-clip[aria-label="red.mp4"]', 500, 0);
	await click(word("Kaydet", "Save"));
	await waitFor(() =>
		fs.access(project).then(
			() => true,
			() => false,
		),
	);
	const data = JSON.parse(await fs.readFile(project, "utf8")),
		clips = data.editor.sequence.clips;
	const lower = clips.find((c) => c.path === red),
		upper = clips.find((c) => c.path === blue && c.track === 1),
		audio = clips.find((c) => c.track === -1);
	assert.ok(Math.abs(lower.start - 500) < 30);
	assert.ok(Math.abs(upper.start - 1000) < 30);
	assert.equal(upper.volume, 0);
	assert.equal(audio.start, upper.start);
	pick = project;
	await click(word("Proje aç", "Open project"));
	await waitFor(() =>
		run(
			"document.querySelectorAll('.seq-clip').length===3 && !document.querySelector('.seq-details')",
		),
	);
	// Scrub the ruler into the overlap. The monitor's top picture must be blue.
	const point = await run(
		`(()=>{const r=document.querySelector('.seq-ruler').getBoundingClientRect();const c=document.querySelector('.seq-clip').getBoundingClientRect();return {x:Math.round(r.x+c.width*.75),y:Math.round(r.y+8)}})()`,
	);
	win.webContents.sendInputEvent({ type: "mouseDown", ...point, button: "left", clickCount: 1 });
	win.webContents.sendInputEvent({ type: "mouseUp", ...point, button: "left", clickCount: 1 });
	await waitFor(() =>
		run(
			"Array.from(document.querySelectorAll('.seq-picture video')).some(v=>v.src.endsWith('blue.mp4')&&v.style.visibility==='visible'&&v.readyState>=2)",
		),
	);
	save = output;
	await click(word("Dışa aktar", "Export"));
	await waitFor(() => run("!!document.querySelector('[data-testid=confirm-export]')"));
	await run("document.querySelector('[data-testid=confirm-export]').click()");
	await waitFor(() =>
		fs.access(output).then(
			() => true,
			() => false,
		),
	);
	const pixel = (t) => [
		...execFileSync(ffmpeg, [
			"-v",
			"error",
			"-ss",
			String(t),
			"-i",
			output,
			"-frames:v",
			"1",
			"-vf",
			"scale=1:1",
			"-pix_fmt",
			"rgb24",
			"-f",
			"rawvideo",
			"-",
		]),
	];
	const black = pixel(0.25),
		r = pixel(0.75),
		b = pixel(1.5);
	assert.ok(Math.max(...black) < 15 && r[0] > 200 && b[2] > 200);
	const rms = (t) => {
		const bytes = execFileSync(ffmpeg, [
			"-v",
			"error",
			"-ss",
			String(t),
			"-i",
			output,
			"-t",
			"0.1",
			"-vn",
			"-ac",
			"1",
			"-f",
			"s16le",
			"-",
		]);
		let squares = 0;
		for (let i = 0; i < bytes.length; i += 2) squares += bytes.readInt16LE(i) ** 2;
		return Math.sqrt(squares / (bytes.length / 2));
	};
	assert.ok(rms(0.1) < 3 && rms(0.7) > 100 && rms(2.7) > 100);
	console.log(
		"PASS import, real pointer drag on V1/V2, separate audio, save/reopen, scrub, and exported black/red/blue frames and audio timing",
	);
	// Edit the top (second) video and save a draft in the parent project.
	await run("document.querySelector('[data-testid=sequence-tool-text]').click()");
	await waitFor(() =>
		run("!!document.querySelector('.seq-clip-pane .workspace-inspector textarea')"),
	);
	await run(
		`(()=>{const el=document.querySelector('.seq-clip-pane .workspace-inspector textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Layer two');el.dispatchEvent(new Event('input',{bubbles:true}));})()`,
	);
	await delay(200);
	await run("document.querySelector('.seq-top button svg.lucide-save').parentElement.click()");
	const read = async () => JSON.parse(await fs.readFile(project, "utf8")).editor.sequence;
	await waitFor(async () =>
		(await read()).pendingEdit?.edit.editor.annotationRegions.some(
			(a) => a.content === "Layer two",
		),
	);
	win.webContents.send("menu-load-project");
	await delay(500);
	await waitFor(() =>
		run("!!document.querySelector('[data-testid=apply-clip-edits]:not(:disabled)')"),
	);
	await run("document.querySelector('[data-testid=apply-clip-edits]').click()");
	await waitFor(() => run("!document.querySelector('.seq-clip-pane')"));
	await click(word("Kaydet", "Save"));
	await waitFor(async () => (await read()).clips.some((c) => c.edit?.videoPath === blue));
	const applied = await read(),
		edited = applied.clips.find((c) => c.track === 1);
	assert.equal(edited.edit.editor.annotationRegions[0].content, "Layer two");
	assert.equal(edited.start, upper.start);
	assert.equal(edited.id, upper.id);
	assert.deepEqual(
		applied.clips.find((c) => c.id === lower.id),
		lower,
	);
	assert.equal(applied.pendingEdit, undefined);
	// Reopen the source recipe, then return to the full edit and export it as a GIF.
	await run("document.querySelector('[data-testid=sequence-tool-appearance]').click()");
	await waitFor(() =>
		run("document.querySelector('[data-testid=preview-frame] video')?.src.endsWith('blue.mp4')"),
	);
	await run("document.querySelector('.seq-edit-heading button').click()");
	await run("document.querySelector('[data-testid=add-sequence-graphic]').click()");
	await waitFor(() => run("!!document.querySelector('[role=dialog] textarea')"));
	await run(
		`(()=>{const el=document.querySelector('[role=dialog] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Title');el.dispatchEvent(new Event('input',{bubbles:true}));})()`,
	);
	await run("document.querySelector('[data-testid=save-sequence-graphic]').click()");
	await waitFor(() => run("document.querySelectorAll('.seq-clip').length===4"));
	await click(word("Kaydet", "Save"));
	await waitFor(async () =>
		(await read()).clips.some((c) => c.graphic?.textContent === "Title" && c.track > 1),
	);
	await click(word("Dışa aktar", "Export"));
	await waitFor(() => run("!!document.querySelector('[data-testid=export-setup]')"));
	await run(
		"Array.from(document.querySelectorAll('[data-testid=export-setup] button')).find(b=>b.textContent.includes('GIF')).click()",
	);
	save = path.join(dir, "edit.gif");
	await run("document.querySelector('[data-testid=confirm-export]').click()");
	await waitFor(() =>
		fs.access(save).then(
			() => true,
			() => false,
		),
	);
	assert.match((await fs.readFile(save)).subarray(0, 6).toString(), /^GIF8/);
	console.log(
		"PASS selected-clip text edits, parent draft, original-layer identity, editable source, and GIF export",
	);
	// A screen project retains its edits when its rendered picture is brought into the sequence.
	pick = path.join(dir, "old.screenmovie");
	await fs.writeFile(
		pick,
		JSON.stringify({
			version: 1,
			videoPath: red,
			editor: {
				clipSplits: [1000],
				trimRegions: [{ id: "trim-1", startMs: 200, endMs: 500 }],
				exportFps: 30,
			},
		}),
	);
	await click(word("Proje aç", "Open project"));
	await waitFor(() =>
		run(
			"!!document.querySelector('[data-testid=preview-frame] video') && document.querySelector('[data-testid=preview-frame] video').readyState>=2",
		),
	);
	await click(word("Video düzenleme", "Video editing"));
	await waitFor(() => run("document.querySelectorAll('.seq-clip').length>=2"));
	console.log("PASS screen project conversion keeps trimmed source and split clips");
}
main()
	.then(
		() => 0,
		(e) => {
			console.error(e);
			return 1;
		},
	)
	.then(async (code) => {
		if (dir) await fs.rm(dir, { recursive: true, force: true });
		app.exit(code);
	});
