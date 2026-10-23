// Exercises timeline editing tools with real input: context menu split, copy/paste,
// nudge, drag snapping to the playhead, zoom slider and follow-playhead.
// Isolated profile; needs artifacts/sample.mp4. Run after `npx vite build`.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
app.setPath('userData', path.join(artifacts, 'timeline-tools-profile'));
// Electron treats the script folder as the app folder; point it at the repo for assets.
app.getAppPath = () => root;

const report = { checks: [], errors: [] };
function check(name, passed, detail) {
  report.checks.push({ name, passed: !!passed, ...(detail === undefined ? {} : { detail }) });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : `: ${detail}`}`);
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let currentStep = '';
const step = (name) => { currentStep = name; console.log(`STEP ${name}`); };
async function waitFor(getter, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await getter();
    if (value) return value;
    await delay(150);
  }
  throw new Error(`Timed out waiting for application state (${currentStep})`);
}
const renderer = (win, code) => win.webContents.executeJavaScript(code, true);
const findWindow = (part) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes(part));

(async () => {
  await fs.mkdir(artifacts, { recursive: true });
  const sample = path.join(artifacts, 'sample.mp4');
  const projectPath = path.join(artifacts, 'timeline-tools.screenmovie');
  await fs.writeFile(projectPath, JSON.stringify({
    version: 1,
    videoPath: sample,
    editor: { zoomRegions: [{ id: 'zoom-1', startMs: 1000, endMs: 3000, depth: 3, focus: { cx: 0.5, cy: 0.5 } }] },
  }));

  await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href);
  await app.whenReady();
  step('welcome');
  const welcome = await waitFor(() => findWindow('welcome'));
  await waitFor(() => renderer(welcome, `document.body.innerText.includes('Proje')`));
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [projectPath] });
  await renderer(welcome, `Array.from(document.querySelectorAll('button')).find(b => /Proje aç/.test(b.textContent)).click()`);
  step('editor');
  const win = await waitFor(() => findWindow('editor'));
  await waitFor(() => renderer(win, `!!document.querySelector('video') && document.querySelector('video').readyState >= 2`));
  await delay(1200);
  win.focus();

  dialog.showSaveDialog = async () => ({ canceled: false, filePath: projectPath });
  async function saved(predicate) {
    win.webContents.send('menu-save-project');
    return waitFor(async () => {
      const data = JSON.parse(await fs.readFile(projectPath, 'utf8'));
      return predicate(data.editor) ? data.editor : null;
    });
  }
  const seek = async (seconds) => {
    await renderer(win, `document.querySelector('video').currentTime = ${seconds}`);
    await delay(400);
  };
  const zoomItems = `Array.from(document.querySelectorAll('[data-timeline-body] .group')).filter(el => el.textContent.includes('1.8') && el.getBoundingClientRect().height < 60).sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)`;
  const itemRect = async (index) => renderer(win, `(() => { const r = ${zoomItems}[${index}].getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
  const key = (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  };

  // Right-click → split at the playhead.
  await seek(2);
  const first = await itemRect(0);
  win.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(first.x + first.width / 4), y: Math.round(first.y + first.height / 2), button: 'right', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(first.x + first.width / 4), y: Math.round(first.y + first.height / 2), button: 'right', clickCount: 1 });
  step('context menu');
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="region-context-menu"]')`));
  check('Right-click opens the item menu', true);
  await renderer(win, `document.querySelector('[data-testid="region-context-menu"] [data-command="split"]').click()`);
  step('split');
  let editor = await saved((e) => e.zoomRegions.length === 2);
  const sorted = [...editor.zoomRegions].sort((a, b) => a.startMs - b.startMs);
  check('Split at the playhead makes two zooms', sorted[0].endMs === 2000 && sorted[1].startMs === 2000, JSON.stringify(sorted.map((z) => [z.startMs, z.endMs])));

  // Copy the selected zoom, paste it at 4.5 s, nudge it right by 0.1 s.
  const second = await itemRect(1);
  win.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(second.x + second.width / 2), y: Math.round(second.y + second.height / 2), button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(second.x + second.width / 2), y: Math.round(second.y + second.height / 2), button: 'left', clickCount: 1 });
  await delay(200);
  const mod = process.platform === 'darwin' ? 'meta' : 'control';
  key('C', [mod]);
  await delay(200);
  await seek(4.5);
  key('V', [mod]);
  step('paste');
  editor = await saved((e) => e.zoomRegions.length === 3);
  const pasted = editor.zoomRegions.find((z) => z.startMs === 4500);
  check('Copy/paste puts a copy at the playhead', !!pasted && pasted.endMs === 5500, JSON.stringify(editor.zoomRegions.map((z) => [z.startMs, z.endMs])));
  key('Right', ['alt']);
  step('nudge');
  editor = await saved((e) => e.zoomRegions.some((z) => z.startMs === 4600));
  check('Alt + → nudges the selected item by 0.1 s', true);
  const playheadAfterNudge = await renderer(win, `document.querySelector('video').currentTime`);
  check('Nudging does not move the playhead', Math.abs(playheadAfterNudge - 4.5) < 0.01, String(playheadAfterNudge));

  // Drag the pasted zoom so its start lands a few pixels from the playhead (at 4.0 s): it snaps.
  await seek(4);
  const items = await renderer(win, `${zoomItems}.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })`);
  const target = items.reduce((best, item) => (item.x > best.x ? item : best));
  const pxPerMs = (items[1].x - items[0].x) / 1000; // zoom 2 starts 1000 ms after zoom 1
  const dragBy = -(600 * pxPerMs) + 4; // 0.6 s left, then 4 px off the playhead
  const from = { x: Math.round(target.x + target.width / 2), y: Math.round(target.y + target.height / 2) };
  win.webContents.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, button: 'left', clickCount: 1 });
  for (let step = 1; step <= 10; step += 1) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(from.x + (dragBy * step) / 10), y: from.y, button: 'left', modifiers: ['leftButtonDown'] });
    await delay(30);
  }
  const guideVisible = await renderer(win, `getComputedStyle(document.querySelector('[data-testid="timeline-snap-guide"]')).display !== 'none'`);
  win.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(from.x + dragBy), y: from.y, button: 'left', clickCount: 1 });
  check('Snap guide shows while dragging near the playhead', guideVisible);
  step('snap');
  editor = await saved((e) => e.zoomRegions.some((z) => z.startMs === 4000));
  check('Dropped item snaps exactly to the playhead', true);

  // Zoom slider and follow playhead.
  await renderer(win, `document.querySelector('[data-testid="timeline-zoom-slider"] [role="slider"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))`);
  await delay(300);
  const sliderValue = await renderer(win, `Number(document.querySelector('[data-testid="timeline-zoom-slider"] [role="slider"]').getAttribute('aria-valuenow'))`);
  check('Zoom slider zooms the timeline', sliderValue > 800, String(sliderValue));
  check('Follow playhead is on by default', await renderer(win, `document.querySelector('[data-testid="timeline-follow-playhead"]').getAttribute('aria-pressed') === 'true'`));
  // Visible range from the ruler labels (m:ss.s), in seconds.
  const visibleSeconds = () => renderer(win, `(document.querySelector('[data-timeline-body]').innerText.match(/\\d+:\\d+\\.\\d+/g) || []).map(t => { const [m, s] = t.split(':'); return Number(m) * 60 + Number(s); })`);
  const before = await visibleSeconds();
  const now = await renderer(win, `document.querySelector('video').currentTime`);
  const followTarget = now > 3 ? now - 2 : now + 2;
  await seek(followTarget);
  const after = await visibleSeconds();
  const shows = (labels, t) => labels.length > 1 && Math.min(...labels) - 0.2 <= t && t <= Math.max(...labels) + 0.2;
  check('Timeline view follows the playhead', !shows(before, followTarget) && shows(after, followTarget), `${before.join(',')} → ${after.join(',')} (playhead ${followTarget.toFixed(2)} s)`);
  // C cuts: splits the selected item at the playhead, or adds a cut to the video.
  step('cut key');
  await renderer(win, `document.querySelector('[data-testid="timeline-zoom-slider"] [role="slider"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))`);
  await delay(400);
  await seek(1.5);
  const firstZoom = await itemRect(0);
  win.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(firstZoom.x + 6), y: Math.round(firstZoom.y + firstZoom.height / 2), button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(firstZoom.x + 6), y: Math.round(firstZoom.y + firstZoom.height / 2), button: 'left', clickCount: 1 });
  await delay(200);
  await seek(1.5);
  const zoomsBeforeCut = (await saved(() => true)).zoomRegions.length;
  key('C');
  editor = await saved((e) => e.zoomRegions.length === zoomsBeforeCut + 1);
  check('C splits the selected item at the playhead', editor.zoomRegions.some((z) => z.endMs === 1500) && editor.zoomRegions.some((z) => z.startMs === 1500));
  await renderer(win, `document.querySelector('[data-timeline-body]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
  win.webContents.send('menu-save-project');
  const trimsBefore = (await saved(() => true)).trimRegions.length;
  await renderer(win, `document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
  await seek(5);
  // Nothing selected now: C splits the video at the playhead (Premiere-style).
  await renderer(win, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await delay(200);
  key('C');
  editor = await saved((e) => (e.clipSplits || []).length > 0 || e.zoomRegions.length > zoomsBeforeCut + 1);
  check('C with nothing selected splits the video', JSON.stringify(editor.clipSplits) === '[5000]' && editor.trimRegions.length === trimsBefore, JSON.stringify(editor.clipSplits));
  await fs.writeFile(path.join(artifacts, 'timeline-tools.png'), (await win.webContents.capturePage()).toPNG());
})()
  .catch(async (error) => {
    report.errors.push(String(error?.stack || error));
    console.error(error);
    const win = findWindow('editor') || findWindow('welcome');
    if (win) await fs.writeFile(path.join(artifacts, 'timeline-tools-failure.png'), (await win.webContents.capturePage()).toPNG()).catch(() => undefined);
  })
  .finally(async () => {
    await fs.writeFile(path.join(artifacts, 'timeline-tools-report.json'), JSON.stringify(report, null, 2));
    const failed = report.errors.length > 0 || report.checks.some((entry) => !entry.passed);
    console.log(`TIMELINE_TOOLS ${failed ? 'FAILED' : 'PASSED'}`);
    app.exit(failed ? 1 : 0);
  });
