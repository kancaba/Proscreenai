// Premiere-style cutting: C splits the video at the playhead, Delete on a selected part cuts
// it out and the timeline closes the gap (later items move up), the cut marker brings it
// back, undo works, and the export is shorter. Isolated profile; needs artifacts/sample.mp4.
// Run after `npx vite build`.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
app.setPath('userData', path.join(artifacts, 'clip-cut-profile'));
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
  await fs.rm(path.join(artifacts, 'clip-cut-profile'), { recursive: true, force: true });
  const sample = path.join(artifacts, 'sample.mp4');
  const projectPath = path.join(artifacts, 'clip-cut.screenmovie');
  await fs.writeFile(projectPath, JSON.stringify({ version: 1, videoPath: sample, editor: { zoomRegions: [{ id: 'zoom-1', startMs: 4500, endMs: 5500, depth: 3, focus: { cx: 0.5, cy: 0.5 } }] } }));

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
  const seek = async (seconds) => { await renderer(win, `document.querySelector('video').currentTime = ${seconds}`); await delay(400); };
  const key = (keyCode) => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode }); };
  const trackText = () => renderer(win, `document.querySelector('[data-testid="source-video-track"]').innerText`);
  const parts = () => renderer(win, `Array.from(document.querySelectorAll('[data-testid="clip-segment"]')).map(b => Number(b.dataset.start))`);

  check('No cut row; the video is one part', !(await renderer(win, `document.body.innerText.includes('KESME')`)) && (await parts()).length === 1);
  await seek(2); key('C');
  await seek(4); key('C');
  let editor = await saved((e) => (e.clipSplits || []).length === 2);
  check('C splits the video at the playhead', JSON.stringify(editor.clipSplits) === '[2000,4000]', JSON.stringify(editor.clipSplits));
  check('The track shows three parts', (await parts()).length === 3, JSON.stringify(await parts()));

  await renderer(win, `document.querySelector('[data-testid="clip-segment"][data-start="2000"]').click()`);
  await delay(200);
  check('Clicking a part selects it', await renderer(win, `document.querySelector('[data-testid="clip-segment"][data-start="2000"]').getAttribute('aria-pressed') === 'true'`));
  key('Delete');
  editor = await saved((e) => e.trimRegions.length === 1);
  check('Delete cuts the selected part out', editor.trimRegions[0].startMs === 2000 && editor.trimRegions[0].endMs === 4000, JSON.stringify(editor.trimRegions));
  await delay(400);
  check('The timeline closes the gap', /4\.0s/.test(await trackText()) && (await parts()).length === 2, (await trackText()).replace(/\s+/g, ' '));
  check('Edits keep their source time', editor.zoomRegions[0].startMs === 4500 && editor.zoomRegions[0].endMs === 5500);
  const zoomPosition = await renderer(win, `(() => {
    const track = document.querySelector('[data-testid="source-video-track"]').getBoundingClientRect();
    const zoom = Array.from(document.querySelectorAll('[data-timeline-body] .group')).find(el => el.textContent.includes('1.8') && el.getBoundingClientRect().height < 60).getBoundingClientRect();
    return (zoom.left - track.left) / track.width;
  })()`);
  check('Later items move up with the video', Math.abs(zoomPosition - 2500 / 4000) < 0.03, zoomPosition.toFixed(3));

  // Export: the cut part is gone from the video.
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
  check('The export is shorter by the cut', Math.abs(seconds - 4) < 0.25, `${seconds} s`);
  await renderer(win, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await delay(600);

  // The cut marker brings the part back.
  await renderer(win, `document.querySelector('[data-testid="cut-marker"]').click()`);
  await delay(200);
  check('Clicking the cut marker selects the cut', await renderer(win, `document.querySelector('[data-testid="cut-marker"]').getAttribute('aria-pressed') === 'true'`));
  key('Delete');
  editor = await saved((e) => e.trimRegions.length === 0);
  check('Delete on the cut marker restores the part', /6\.0s/.test(await trackText()), (await trackText()).replace(/\s+/g, ' '));
  await renderer(win, `document.querySelector('button[aria-label="Geri al"]').click()`);
  editor = await saved((e) => e.trimRegions.length === 1);
  check('Undo cuts it again', /4\.0s/.test(await trackText()));
  await fs.writeFile(path.join(artifacts, 'clip-cut.png'), (await win.webContents.capturePage()).toPNG());
})()
  .catch(async (error) => {
    report.errors.push(String(error?.stack || error));
    console.error(error);
    const win = findWindow('editor');
    if (win) await fs.writeFile(path.join(artifacts, 'clip-cut-failure.png'), (await win.webContents.capturePage()).toPNG()).catch(() => undefined);
  })
  .finally(async () => {
    await fs.writeFile(path.join(artifacts, 'clip-cut-report.json'), JSON.stringify(report, null, 2));
    const failed = report.errors.length > 0 || report.checks.some((entry) => !entry.passed);
    console.log(`CLIP_CUT ${failed ? 'FAILED' : 'PASSED'}`);
    app.exit(failed ? 1 : 0);
  });
