// Speed lives on the video: a part split with C gets its speed from its card, a badge shows it on
// the video track, there is no separate speed row, and a speed range from an older project (not
// lined up with a part) still shows, can be selected and edited, and exports. Isolated profile;
// needs artifacts/sample.mp4 (6 s). Run after `npx vite build`.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
app.setPath('userData', path.join(artifacts, 'clip-speed-profile'));
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
    const value = await getter();
    if (value) return value;
    await delay(200);
  }
  throw new Error('Timed out waiting for application state');
}
const renderer = (win, code) => win.webContents.executeJavaScript(code, true);
const findWindow = (part) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes(part));

(async () => {
  await fs.rm(path.join(artifacts, 'clip-speed-profile'), { recursive: true, force: true });
  const sample = path.join(artifacts, 'sample.mp4');
  const projectPath = path.join(artifacts, 'clip-speed.screenmovie');
  // Parts: 0–2, 2–4, 4–6 s. An older-style speed range at 4.5–5.5 s does not match a part.
  await fs.writeFile(projectPath, JSON.stringify({ version: 1, videoPath: sample, editor: { clipSplits: [2000, 4000], speedRegions: [{ id: 'speed-1', startMs: 4500, endMs: 5500, speed: 1.5 }] } }));

  await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href);
  await app.whenReady();
  const welcome = await waitFor(() => findWindow('welcome'));
  await waitFor(() => renderer(welcome, `document.body.innerText.includes('Proje')`));
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [projectPath] });
  await renderer(welcome, `Array.from(document.querySelectorAll('button')).find(b => /Proje aç/.test(b.textContent)).click()`);
  const win = await waitFor(() => findWindow('editor'));
  await waitFor(() => renderer(win, `!!document.querySelector('video') && document.querySelector('video').readyState >= 2`));
  await delay(1500);
  win.focus();

  dialog.showSaveDialog = async () => ({ canceled: false, filePath: projectPath });
  async function saved(predicate = () => true) {
    await fs.rm(projectPath, { force: true });
    win.webContents.send('menu-save-project');
    return waitFor(async () => {
      const data = JSON.parse(await fs.readFile(projectPath, 'utf8').catch(() => '{}'));
      return data.editor && predicate(data.editor) ? data.editor : null;
    });
  }
  const badges = () => renderer(win, `Array.from(document.querySelectorAll('[data-testid="speed-badge"]')).map(b => b.dataset.speed).join(',')`);

  check('There is no separate speed row', !(await renderer(win, `Array.from(document.querySelectorAll('.workspace-row-label')).some(el => el.textContent.trim() === 'HIZ')`)));
  check('A speed range from an older project shows on the video track', (await badges()) === '1.5', await badges());

  // Select the middle part and give it 2×.
  await renderer(win, `document.querySelector('[data-testid="clip-segment"][data-start="2000"]').click()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="clip-part-inspector"]')`));
  check('Selecting a part opens its card with the speed set to 1×', await renderer(win, `document.querySelector('[data-testid="part-speed-1"]').getAttribute('aria-checked') === 'true'`));
  await renderer(win, `document.querySelector('[data-testid="part-speed-2"]').click()`);
  let editor = await saved((e) => e.speedRegions.some((r) => r.startMs === 2000 && r.endMs === 4000));
  check('Choosing 2× saves a speed exactly over the part', editor.speedRegions.some((r) => r.startMs === 2000 && r.endMs === 4000 && r.speed === 2), JSON.stringify(editor.speedRegions));
  check('The part shows a 2× badge', (await badges()).split(',').includes('2'), await badges());

  // The older range is still selectable and editable.
  await renderer(win, `document.querySelector('[data-testid="speed-badge"][data-speed="1.5"]').click()`);
  await delay(300);
  check('Clicking an older speed range selects it for editing', await renderer(win, `document.body.innerText.includes('Oynatma hızı') || document.body.innerText.includes('Playback speed')`));

  // 1× clears the part again, then 2× once more for the export.
  await renderer(win, `document.querySelector('[data-testid="clip-segment"][data-start="2000"]').click()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="part-speed-1"]')`));
  await renderer(win, `document.querySelector('[data-testid="part-speed-1"]').click()`);
  editor = await saved((e) => !e.speedRegions.some((r) => r.startMs === 2000));
  check('1× removes the speed from the part only', editor.speedRegions.length === 1 && editor.speedRegions[0].id === 'speed-1', JSON.stringify(editor.speedRegions));
  await renderer(win, `document.querySelector('[data-testid="part-speed-2"]').click()`);
  await saved((e) => e.speedRegions.some((r) => r.startMs === 2000 && r.speed === 2));
  await renderer(win, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await fs.writeFile(path.join(artifacts, 'clip-speed.png'), (await win.webContents.capturePage()).toPNG());

  // Export: 6 s with 2 s at 2× and 1 s at 1.5× is about 6 − 1 − 0.33 = 4.67 s.
  const exportStarted = Date.now();
  await renderer(win, `Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('dışa aktar')).click()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="confirm-export"]')`));
  await renderer(win, `document.querySelector('[data-testid="confirm-export"]').click()`);
  const dir = path.join(app.getPath('userData'), 'recordings');
  const exported = await waitFor(async () => {
    const names = (await fs.readdir(dir).catch(() => [])).filter((name) => name.endsWith('.mp4'));
    for (const name of names) {
      const stat = await fs.stat(path.join(dir, name));
      if (stat.mtimeMs >= exportStarted - 1000 && stat.size > 1000) return path.join(dir, name);
    }
    return null;
  }, 180000);
  await delay(2500);
  const probe = spawnSync(ffmpeg, ['-hide_banner', '-i', exported], { encoding: 'utf8' }).stderr;
  const video = probe.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const seconds = video ? Number(video[2]) * 60 + Number(video[3]) : -1;
  check('The export is shorter by both speed changes', Math.abs(seconds - 4.67) < 0.3, `${seconds} s`);
})()
  .catch(async (error) => {
    report.errors.push(String(error?.stack || error));
    console.error(error);
    const win = findWindow('editor');
    if (win) await fs.writeFile(path.join(artifacts, 'clip-speed-failure.png'), (await win.webContents.capturePage()).toPNG()).catch(() => undefined);
  })
  .finally(async () => {
    await fs.writeFile(path.join(artifacts, 'clip-speed-report.json'), JSON.stringify(report, null, 2));
    const failed = report.errors.length > 0 || report.checks.some((entry) => !entry.passed);
    console.log(`CLIP_SPEED ${failed ? 'FAILED' : 'PASSED'}`);
    app.exit(failed ? 1 : 0);
  });
