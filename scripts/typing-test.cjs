// Typing found while recording: key press times saved next to a recording show as typing
// stretches on the video track; the card speeds a stretch up (and back to 1×) or cuts it, and
// the export reflects the cut. Uses a copy of artifacts/sample.mp4 (6 s) with key times from
// 1 s to about 3 s. Isolated profile; run after `npx vite build`.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
app.setPath('userData', path.join(artifacts, 'typing-profile'));
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
  await fs.rm(path.join(artifacts, 'typing-profile'), { recursive: true, force: true });
  const video = path.join(artifacts, 'typing-sample.mp4');
  await fs.copyFile(path.join(artifacts, 'sample.mp4'), video);
  // Key presses every 120 ms from 1 s to 3.04 s (the stretch becomes 0.85–3.44 s with its padding).
  const keys = Array.from({ length: 18 }, (_, i) => 1000 + i * 120);
  await fs.writeFile(`${video}.cursor.json`, JSON.stringify({ version: 2, samples: [], keys }));
  const projectPath = path.join(artifacts, 'typing.screenmovie');
  await fs.writeFile(projectPath, JSON.stringify({ version: 1, videoPath: video, editor: {} }));

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
  const stretches = () => renderer(win, `Array.from(document.querySelectorAll('[data-testid="typing-stretch"]')).map(b => b.dataset.start).join(',')`);

  check('The typing stretch shows on the video track', (await stretches()) === '850', await stretches());
  await renderer(win, `document.querySelector('[data-testid="typing-stretch"]').click()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="typing-inspector"]')`));
  await fs.writeFile(path.join(artifacts, 'typing-card.png'), (await win.webContents.capturePage()).toPNG());
  check('Clicking it opens the typing card at 1×', await renderer(win, `document.querySelector('[data-testid="typing-speed-1"]').getAttribute('aria-checked') === 'true'`));

  await renderer(win, `document.querySelector('[data-testid="typing-speed-4"]').click()`);
  let editor = await saved((e) => e.speedRegions.length === 1);
  check('4× saves a speed over exactly the typing', editor.speedRegions[0].startMs === 850 && editor.speedRegions[0].endMs === 3440 && editor.speedRegions[0].speed === 4, JSON.stringify(editor.speedRegions));
  check('The video track shows a 4× badge', await renderer(win, `!!document.querySelector('[data-testid="speed-badge"][data-speed="4"]')`));
  // The timeline shows the export's length: 6 s minus 2.59 s of typing plus that typing at 4× (0.65 s).
  const total = await renderer(win, `(document.body.innerText.match(/\\d+[.,]\\d+ \\/ (\\d+[.,]\\d+)s/) || [])[1] || ''`);
  check('The timeline gets shorter by the sped-up typing', total.replace(',', '.') === '4.1', total);
  await fs.writeFile(path.join(artifacts, 'typing-4x.png'), (await win.webContents.capturePage()).toPNG());

  await renderer(win, `document.querySelector('[data-testid="typing-speed-1"]').click()`);
  editor = await saved((e) => e.speedRegions.length === 0);
  check('1× takes the speed off again', editor.speedRegions.length === 0);

  await renderer(win, `document.querySelector('[data-testid="typing-cut"]').click()`);
  editor = await saved((e) => e.trimRegions.length === 1);
  check('Cut removes the typing from the video', editor.trimRegions[0].startMs === 850 && editor.trimRegions[0].endMs === 3440, JSON.stringify(editor.trimRegions));
  check('A cut stretch no longer shows as typing', (await stretches()) === '', await stretches());
  await fs.writeFile(path.join(artifacts, 'typing.png'), (await win.webContents.capturePage()).toPNG());

  // Export: 6 s minus the 2.59 s of typing.
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
  const match = probe.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const seconds = match ? Number(match[2]) * 60 + Number(match[3]) : -1;
  check('The export is shorter by the cut typing', Math.abs(seconds - 3.41) < 0.3, `${seconds} s`);
})()
  .catch(async (error) => {
    report.errors.push(String(error?.stack || error));
    console.error(error);
    const win = findWindow('editor');
    if (win) await fs.writeFile(path.join(artifacts, 'typing-failure.png'), (await win.webContents.capturePage()).toPNG()).catch(() => undefined);
  })
  .finally(async () => {
    await fs.writeFile(path.join(artifacts, 'typing-report.json'), JSON.stringify(report, null, 2));
    const failed = report.errors.length > 0 || report.checks.some((entry) => !entry.passed);
    console.log(`TYPING ${failed ? 'FAILED' : 'PASSED'}`);
    app.exit(failed ? 1 : 0);
  });
