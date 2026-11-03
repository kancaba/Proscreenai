// Blur areas: a project with a blurred area and a zoom onto it shows the blur in the preview
// unzoomed and zoomed, the toolbar's "Bulanıklaştır" adds an area that is drawn by dragging on
// the preview and saved with the project, and the export has the area blurred. Writes preview and
// export frames to artifacts/ to look at. Isolated profile; run after `npx vite build`.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const profile = path.join(artifacts, 'blur-area-profile');
app.setPath('userData', profile);
app.getAppPath = () => root;
const ffmpeg = require('ffmpeg-static');

const report = { checks: [], errors: [] };
function check(name, passed, detail) {
  report.checks.push({ name, passed: !!passed, ...(detail === undefined ? {} : { detail }) });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : `: ${detail}`}`);
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(getter, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await Promise.resolve().then(getter).catch(() => null);
    if (value) return value;
    await delay(200);
  }
  throw new Error('Timed out waiting for application state');
}
const renderer = (win, code) => win.webContents.executeJavaScript(code, true);
const findWindow = (part) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes(part));

/** How much detail a part of a frame has: the mean brightness step between neighbouring pixels. */
function detail(gray, width, height) {
  let sum = 0;
  for (let y = 0; y < height; y++) for (let x = 1; x < width; x++) sum += Math.abs(gray[y * width + x] - gray[y * width + x - 1]);
  return sum / (height * (width - 1));
}
/** The biggest brightness step between neighbouring pixels: high at a sharp edge, low once blurred. */
function sharpestStep(gray, width, height) {
  let most = 0;
  for (let y = 0; y < height; y++) for (let x = 1; x < width; x++) most = Math.max(most, Math.abs(gray[y * width + x] - gray[y * width + x - 1]));
  return most;
}
/** Detail (or, with `measure`, another measure) of an area (fractions of the frame) of a video's frame at `at` seconds. */
function videoDetail(file, at, rect, measure = detail) {
  const size = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' }).stderr.match(/, (\d{2,5})x(\d{2,5})/);
  const [w, h] = [Number(size[1]), Number(size[2])];
  const crop = { x: Math.round(rect.x * w), y: Math.round(rect.y * h), w: Math.round(rect.width * w), h: Math.round(rect.height * h) };
  const out = spawnSync(ffmpeg, ['-v', 'error', '-ss', String(at), '-i', file, '-frames:v', '1', '-vf', `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 64 << 20 });
  return measure(out.stdout, crop.w, crop.h);
}

/** Exports are saved straight into the recordings folder; wait for the newest finished file there. */
async function waitForExportFile(sinceMs, timeout = 180000) {
  const dir = path.join(profile, 'recordings');
  const end = Date.now() + timeout;
  let last = null;
  while (Date.now() < end) {
    const names = await fs.readdir(dir).catch(() => []);
    const stats = await Promise.all(names.filter((name) => name.endsWith('.mp4')).map(async (name) => ({ file: path.join(dir, name), stat: await fs.stat(path.join(dir, name)).catch(() => null) })));
    const fresh = stats.filter((entry) => entry.stat && entry.stat.mtimeMs >= sinceMs - 1000).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0];
    if (fresh) {
      if (last && last.file === fresh.file && last.size === fresh.stat.size && fresh.stat.size > 0) return fresh.file;
      last = { file: fresh.file, size: fresh.stat.size };
    }
    await delay(700);
  }
  throw new Error('Timed out waiting for the exported file');
}

(async () => {
  await fs.rm(profile, { recursive: true, force: true });
  const media = path.join(artifacts, 'blur-area-media');
  await fs.rm(media, { recursive: true, force: true });
  await fs.mkdir(media, { recursive: true });
  // A detailed 4 s picture (moving test pattern with text) at 1280×720.
  const video = path.join(media, 'blur-source.mp4');
  const made = spawnSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
  if (made.status !== 0) throw new Error('Could not make the test video');

  // Over the test pattern's noisy checkerboard, which has the most detail to hide.
  const area = { x: 0.6, y: 0.6, width: 0.3, height: 0.2 };
  const projectPath = path.join(media, 'blur.screenmovie');
  await fs.writeFile(projectPath, JSON.stringify({
    version: 1,
    videoPath: video,
    editor: {
      padding: 0,
      borderRadius: 0,
      zoomRegions: [{ id: 'zoom-1', startMs: 1500, endMs: 4000, depth: 3, focus: { cx: 0.75, cy: 0.7 } }],
      blurRegions: [{ id: 'blur-1', startMs: 0, endMs: 4000, rect: area, style: 'blur', strength: 0.7 }],
    },
  }));

  await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href);
  await app.whenReady();
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [projectPath] });
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: projectPath });
  const welcome = await waitFor(() => findWindow('welcome'));
  await waitFor(() => renderer(welcome, `document.body.innerText.includes('Proje')`));
  await renderer(welcome, `Array.from(document.querySelectorAll('button')).find(b => /Proje aç/.test(b.textContent)).click()`);
  const win = await waitFor(() => findWindow('editor'));
  await waitFor(() => renderer(win, `!!document.querySelector('video') && document.querySelector('video').readyState >= 2`));
  await delay(1500);

  const frameRect = () => renderer(win, `(() => { const r = document.querySelector('[data-testid="preview-frame"]').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; })()`);
  async function capture(name, at) {
    await renderer(win, `(() => { const v = document.querySelector('video'); v.currentTime = ${at}; })()`);
    await delay(1200);
    const image = await win.webContents.capturePage(await frameRect());
    await fs.writeFile(path.join(artifacts, `${name}.png`), image.toPNG());
    return image;
  }
  /** Detail of an area on a preview capture. */
  function previewDetail(image, rect) {
    const { width, height } = image.getSize();
    const bitmap = image.toBitmap();
    const part = (r) => {
      const [x0, y0, w, h] = [Math.round(r.x * width), Math.round(r.y * height), Math.round(r.width * width), Math.round(r.height * height)];
      const gray = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = ((y0 + y) * width + x0 + x) * 4; gray[y * w + x] = (bitmap[i] + bitmap[i + 1] + bitmap[i + 2]) / 3; }
      return detail(gray, w, h);
    };
    return part(rect);
  }

  const shown = previewDetail(await capture('blur-preview-unzoomed', 0.5), area);
  const sharp = videoDetail(video, 0.5, area);
  check('The preview blurs the area', shown < sharp * 0.4, `preview ${shown.toFixed(2)} vs source ${sharp.toFixed(2)}`);
  await capture('blur-preview-zoomed', 3.2);

  // The toolbar adds a new area at the playhead (0.5 s, before the zoom), selected, with a box on the preview.
  await renderer(win, `(() => { const v = document.querySelector('video'); v.currentTime = 0.5; })()`);
  await delay(800);
  await renderer(win, `document.querySelector('[data-testid="tool-blur"]').click()`);
  await waitFor(() => renderer(win, `(() => { const b = document.querySelector('[data-testid="blur-area-box"]'); return b && b.style.display === 'block' && b.getBoundingClientRect().width > 10; })()`), 5000);
  check('"Bulanıklaştır" adds an area to place on the preview', true);
  // Drag on the video to draw it: from 10 %/10 % to 40 %/35 % of the (unzoomed) frame.
  const frame = await frameRect();
  const point = (fx, fy) => ({ x: Math.round(frame.x + frame.width * fx), y: Math.round(frame.y + frame.height * fy) });
  const from = point(0.1, 0.1);
  const to = point(0.4, 0.35);
  win.webContents.sendInputEvent({ type: 'mouseDown', ...from, button: 'left', clickCount: 1 });
  for (let step = 1; step <= 6; step++) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(from.x + (to.x - from.x) * step / 6), y: Math.round(from.y + (to.y - from.y) * step / 6), button: 'left' });
    await delay(40);
  }
  win.webContents.sendInputEvent({ type: 'mouseUp', ...to, button: 'left', clickCount: 1 });
  await delay(600);
  await fs.rm(projectPath, { force: true });
  win.webContents.send('menu-save-project');
  const saved = await waitFor(async () => JSON.parse(await fs.readFile(projectPath, 'utf8').catch(() => '{}')).editor);
  const drawn = saved.blurRegions?.[1]?.rect;
  const close = (a, b) => Math.abs(a - b) < 0.02;
  check('The drawn area is saved with the project', saved.blurRegions?.length === 2 && drawn && close(drawn.x, 0.1) && close(drawn.y, 0.1) && close(drawn.width, 0.3) && close(drawn.height, 0.25), JSON.stringify(saved.blurRegions));

  // Export: the area is blurred in the video file too.
  const started = Date.now();
  await renderer(win, `Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Dışa aktar').click()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="confirm-export"]')`));
  await renderer(win, `document.querySelector('[data-testid="confirm-export"]').click()`);
  const exported = await waitForExportFile(started);
  for (const [at, name] of [[0.5, 'blur-export-unzoomed'], [3.2, 'blur-export-zoomed']]) {
    spawnSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(at), '-i', exported, '-frames:v', '1', path.join(artifacts, `${name}.png`)]);
  }
  const source = videoDetail(video, 0.5, area);
  const out = videoDetail(exported, 0.5, area);
  check('The export blurs the area', out < source * 0.4, `export ${out.toFixed(2)} vs source ${source.toFixed(2)}`);
  // The drawn area is over plain colour bars; their sharp edge at a sixth of the width shows whether it is blurred.
  const edge = { x: 0.12, y: drawn.y + 0.05, width: 0.1, height: 0.1 };
  const edgeOut = videoDetail(exported, 0.8, edge, sharpestStep);
  const edgeSource = videoDetail(video, 0.8, edge, sharpestStep);
  check('The export blurs the drawn area', edgeOut < edgeSource * 0.3, `sharpest step: export ${edgeOut} vs source ${edgeSource}`);
})()
  .catch((error) => {
    report.errors.push(String(error?.stack || error));
    console.error(error);
  })
  .finally(async () => {
    await fs.writeFile(path.join(artifacts, 'blur-area-report.json'), JSON.stringify(report, null, 2));
    app.exit(report.errors.length || report.checks.some((c) => !c.passed) ? 1 : 0);
  });
