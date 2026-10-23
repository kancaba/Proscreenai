// Opens a project with a styled text, captures the preview and the exported frame at the
// same time so preview/export parity can be compared. Isolated profile; needs artifacts/sample.mp4.
// Run after `npx vite build`: npx electron scripts/text-effects-test.cjs
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
app.setPath('userData', path.join(artifacts, 'text-effects-profile'));
// Electron treats the script folder as the app folder; point it at the repo for assets.
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

const TEXT = 'Merhaba **kalın** ve ==vurgu==';


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
  const projectPath = path.join(artifacts, 'text-effects.screenmovie');
  const exported = path.join(artifacts, 'text-effects-export.mp4');
  await fs.rm(exported, { force: true });
  await fs.writeFile(projectPath, JSON.stringify({
    version: 1,
    videoPath: sample,
    editor: {
      padding: 0,
      zoomRegions: [],
      annotationRegions: [{
        id: 'annotation-1', startMs: 0, endMs: 6000, type: 'text', content: TEXT, textContent: TEXT,
        position: { x: 10, y: 35 }, size: { width: 80, height: 30 }, zIndex: 1,
        style: {
          color: '#ffffff', backgroundColor: 'transparent', fontSize: 40, fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none', textAlign: 'center',
          textShadow: 'soft', strokeWidth: 3, strokeColor: '#111827', highlightColor: '#facc15',
        },
        animation: { enter: 'fade', exit: 'none', durationMs: 400 },
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

  // Fade-in: invisible at the very start, fully visible after the animation.
  await renderer(win, `(() => { const v = document.querySelector('video'); v.currentTime = 0.05; })()`);
  await delay(600);
  const earlyOpacity = await renderer(win, `(() => { const el = Array.from(document.querySelectorAll('span')).find(s => s.textContent === 'kalın'); return el ? Number(getComputedStyle(el.parentElement.parentElement).opacity) : -1; })()`);
  check('Fade-in starts transparent at the text start', earlyOpacity >= 0 && earlyOpacity < 0.6, String(earlyOpacity));

  await renderer(win, `(() => { const v = document.querySelector('video'); v.currentTime = 2; })()`);
  await delay(800);
  const runs = await renderer(win, `Array.from(document.querySelectorAll('span')).filter(s => ['kalın','vurgu'].includes(s.textContent)).map(s => ({ text: s.textContent, weight: getComputedStyle(s).fontWeight, color: getComputedStyle(s).color }))`);
  check('Preview renders **bold** and ==highlight== runs', runs.some((r) => r.text === 'kalın' && Number(r.weight) >= 700) && runs.some((r) => r.text === 'vurgu' && r.color === 'rgb(250, 204, 21)'), JSON.stringify(runs));
  const frameRect = await renderer(win, `(() => { const r = document.querySelector('[data-testid="preview-frame"]').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; })()`);
  await fs.writeFile(path.join(artifacts, 'text-effects-preview.png'), (await win.webContents.capturePage(frameRect)).toPNG());

  const exportStartedAt = Date.now();
  await renderer(win, `Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Dışa aktar').click()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="confirm-export"]')`));
  await renderer(win, `document.querySelector('[data-testid="confirm-export"]').click()`);
  await fs.copyFile(await waitForExportFile('.mp4', exportStartedAt), exported);
  await delay(1000);
  check('Styled text exports', (await fs.stat(exported)).size > 1000);
  const ffmpeg = require('ffmpeg-static');
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-ss', '2', '-i', exported, '-frames:v', '1', path.join(artifacts, 'text-effects-export.png')]);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-ss', '0.02', '-i', exported, '-frames:v', '1', path.join(artifacts, 'text-effects-export-start.png')]);
  check('Export frames extracted', true);
})()
  .catch((error) => {
    report.errors.push(String(error?.stack || error));
    console.error(error);
  })
  .finally(async () => {
    await fs.writeFile(path.join(artifacts, 'text-effects-report.json'), JSON.stringify(report, null, 2));
    const failed = report.errors.length > 0 || report.checks.some((entry) => !entry.passed);
    console.log(`TEXT_EFFECTS ${failed ? 'FAILED' : 'PASSED'}`);
    app.exit(failed ? 1 : 0);
  });
