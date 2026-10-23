// Captures a two-line speech caption (subtitle style, default frame padding) in the preview
// and in the exported video at the same time, and compares where the caption box lands
// relative to the frame. Isolated profile; needs artifacts/sample.mp4. Run after `npx vite build`.
const { app, BrowserWindow, dialog, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
app.setPath('userData', path.join(artifacts, 'caption-parity-profile'));
app.getAppPath = () => root;

const report = { checks: [], errors: [] };
function check(name, passed, detail) {
  report.checks.push({ name, passed: !!passed, ...(detail === undefined ? {} : { detail }) });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : `: ${detail}`}`);
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(getter, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await getter();
    if (value) return value;
    await delay(150);
  }
  throw new Error('Timed out waiting for application state');
}
const renderer = (win, code) => win.webContents.executeJavaScript(code, true);
const findWindow = (part) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes(part));

const TEXT = 'Fatura İşlemleri menüsünden İhracat Faturası ekranını açıyoruz.';

/**
 * Bounding box (as 0–1 fractions of the image) of the caption's dark background: rows and
 * columns in the caption area that are mostly dark (scattered dark video pixels do not count).
 */
function darkBox(image) {
  const { width, height } = image.getSize();
  const bitmap = image.toBitmap(); // BGRA
  const dark = (x, y) => {
    const i = (y * width + x) * 4;
    return (bitmap[i] + bitmap[i + 1] + bitmap[i + 2]) / 3 < 95;
  };
  const x0 = Math.floor(width * 0.05);
  const x1 = Math.floor(width * 0.95);
  const rows = [];
  for (let y = Math.floor(height * 0.6); y < Math.floor(height * 0.98); y += 1) {
    let count = 0;
    for (let x = x0; x < x1; x += 1) if (dark(x, y)) count += 1;
    if (count > (x1 - x0) * 0.6) rows.push(y);
  }
  if (rows.length === 0) return null;
  const top = rows[0];
  const bottom = rows[rows.length - 1];
  const columns = [];
  for (let x = x0; x < x1; x += 1) {
    let count = 0;
    for (const y of rows) if (dark(x, y)) count += 1;
    if (count > rows.length * 0.45) columns.push(x);
  }
  if (columns.length === 0) return null;
  return { x: columns[0] / width, y: top / height, w: (columns[columns.length - 1] - columns[0]) / width, h: (bottom - top) / height };
}


/** Exports are saved straight into the recordings folder; wait for the newest finished file there. */
async function waitForExportFile(ext, sinceMs, timeout = 180000) {
  const dir = path.join(app.getPath('userData'), 'recordings');
  const end = Date.now() + timeout;
  let last = null;
  while (Date.now() < end) {
    const names = await fs.readdir(dir).catch(() => []);
    const stats = await Promise.all(names.filter((name) => name.endsWith(ext)).map(async (name) => ({ file: path.join(dir, name), stat: await fs.stat(path.join(dir, name)).catch(() => null) })));
    const fresh = stats.filter((entry) => entry.stat && entry.stat.mtimeMs >= sinceMs - 1000).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0];
    if (fresh) {
      if (last && last.file === fresh.file && last.size === fresh.stat.size && fresh.stat.size > 0) return fresh.file;
      last = { file: fresh.file, size: fresh.stat.size };
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error('Timed out waiting for the exported file');
}

(async () => {
  await fs.mkdir(artifacts, { recursive: true });
  const sample = path.join(artifacts, 'sample.mp4');
  const projectPath = path.join(artifacts, 'caption-parity.screenmovie');
  const suffix = (process.env.CAPTION_ASPECT || '16:9').replace(':', 'x');
  const exported = path.join(artifacts, `caption-parity-export-${suffix}.mp4`);
  await fs.rm(exported, { force: true });
  await fs.writeFile(projectPath, JSON.stringify({
    version: 1,
    videoPath: sample,
    editor: {
      // Plain colour background so the dark caption box is easy to find.
      wallpaper: '#f2f2f2', zoomRegions: [],
      // CAPTION_ASPECT=1:1 or 9:16 checks smaller frames, where text must shrink to fit.
      aspectRatio: process.env.CAPTION_ASPECT || '16:9',
      annotationRegions: [{
        id: 'annotation-1', startMs: 0, endMs: 6000, type: 'text', content: TEXT, textContent: TEXT, generatedBy: 'transcript',
        position: { x: 10, y: 76 }, size: { width: 80, height: 16 }, zIndex: 1,
        style: { color: '#ffffff', backgroundColor: '#000000b3', fontSize: 28, fontFamily: '"SF Pro Display", "SF Pro Text", -apple-system, BlinkMacSystemFont, sans-serif', fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', textShadow: 'none', strokeWidth: 0 },
      }],
    },
  }));

  await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href);
  await app.whenReady();
  const welcome = await waitFor(() => findWindow('welcome'));
  await waitFor(() => renderer(welcome, `document.body.innerText.includes('Proje')`));
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [projectPath] });
  await renderer(welcome, `Array.from(document.querySelectorAll('button')).find(b => /Proje aç/.test(b.textContent)).click()`);
  const win = await waitFor(() => findWindow('editor'));
  await waitFor(() => renderer(win, `!!document.querySelector('video') && document.querySelector('video').readyState >= 2`));
  await delay(1500);
  await renderer(win, `document.querySelector('video').currentTime = 2`);
  await delay(1000);
  const stage = await renderer(win, `(() => { const r = document.querySelector('[data-testid="preview-frame"]').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; })()`);
  const preview = await win.webContents.capturePage(stage);
  await fs.writeFile(path.join(artifacts, `caption-parity-preview-${suffix}.png`), preview.toPNG());
  report.fit = await renderer(win, `(() => { const s = Array.from(document.querySelectorAll('span')).find(e => e.textContent.startsWith('Fatura')); const box = s.closest('.overflow-hidden'); return { span: Math.round(s.getBoundingClientRect().height), box: Math.round(box.getBoundingClientRect().height), font: getComputedStyle(s).fontSize }; })()`);
  report.lines = await renderer(win, `(() => { const s = Array.from(document.querySelectorAll('span')).find(e => e.textContent.startsWith('Fatura')); const r = s.getClientRects(); return { rects: r.length, height: Math.round(s.getBoundingClientRect().height) }; })()`);

  const exportStartedAt = Date.now();
  await renderer(win, `Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('dışa aktar')).click()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="confirm-export"]')`));
  await renderer(win, `document.querySelector('[data-testid="confirm-export"]').click()`);
  await fs.copyFile(await waitForExportFile('.mp4', exportStartedAt), exported);
  await delay(1500);
  const ffmpeg = require('ffmpeg-static');
  const frame = path.join(artifacts, `caption-parity-export-${suffix}.png`);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-ss', '2', '-i', exported, '-frames:v', '1', frame]);

  const a = darkBox(preview);
  const b = darkBox(nativeImage.createFromPath(frame));
  report.preview = a;
  report.exported = b;
  const close = (p, q) => Math.abs(p - q) < 0.02;
  check('Caption box found in both', a && b, JSON.stringify({ a, b }));
  check('Caption fits its box in the preview', report.fit.span <= report.fit.box + 1, JSON.stringify(report.fit));
  if (a && b) {
    check('Same position', close(a.x, b.x) && close(a.y, b.y), `preview ${a.x.toFixed(3)},${a.y.toFixed(3)} export ${b.x.toFixed(3)},${b.y.toFixed(3)}`);
    check('Same size', close(a.w, b.w) && close(a.h, b.h), `preview ${a.w.toFixed(3)}×${a.h.toFixed(3)} export ${b.w.toFixed(3)}×${b.h.toFixed(3)}`);
  }
})()
  .catch((error) => {
    report.errors.push(String(error?.stack || error));
    console.error(error);
  })
  .finally(async () => {
    await fs.writeFile(path.join(artifacts, 'caption-parity-report.json'), JSON.stringify(report, null, 2));
    const failed = report.errors.length > 0 || report.checks.some((entry) => !entry.passed);
    console.log(`CAPTION_PARITY ${failed ? 'FAILED' : 'PASSED'}`);
    app.exit(failed ? 1 : 0);
  });
