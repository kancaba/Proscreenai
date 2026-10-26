// Audio tracks on the timeline: clips sit on A1/A2/… rows, move between tracks by dragging
// (real mouse input) or from the clip card, keep one clip card in the inspector that shows
// edited-timeline times, and short clips can still be grabbed in the middle to move them.
// Isolated profile; needs artifacts/sample.mp4 and artifacts/tts-fixture.mp3. Run after `npx vite build`.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
app.setPath('userData', path.join(artifacts, 'timeline-tracks-profile'));
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

(async () => {
  await fs.rm(path.join(artifacts, 'timeline-tracks-profile'), { recursive: true, force: true });
  const sample = path.join(artifacts, 'sample.mp4');
  const tts = path.join(artifacts, 'tts-fixture.mp3');
  const projectPath = path.join(artifacts, 'timeline-tracks.screenmovie');
  const clip = (id, startMs, endMs, track) => ({ id, startMs, endMs, audioPath: tts, volume: 1, ...(track ? { track } : {}) });
  // 2–3 s of the video is cut; audio-2 (source 3.2 s) therefore shows at 2.2 s on the timeline.
  await fs.writeFile(projectPath, JSON.stringify({ version: 1, videoPath: sample, editor: {
    trimRegions: [{ id: 'trim-1', startMs: 2000, endMs: 3000 }],
    audioRegions: [clip('audio-1', 200, 1500), clip('audio-2', 3200, 4400, 1), clip('audio-3', 4600, 4800)],
  } }));

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
  const trackLabels = () => renderer(win, `Array.from(document.querySelectorAll('.workspace-row-label')).map(el => el.textContent.trim()).filter(t => /^A\\d$/.test(t))`);
  // Clips are found by the time label they show ("2.2s – 3.4s"); rows below the visible part of
  // the timeline are scrolled into view first, as a user would.
  const itemRect = async (label) => { await renderer(win, `Array.from(document.querySelectorAll('[data-timeline-body] .group')).filter(el => el.querySelector('[data-testid="trim-handle-left"]') && el.getBoundingClientRect().height < 60).find(el => el.textContent.includes(${JSON.stringify(label)})).scrollIntoView({ block: 'center' })`); await delay(150); return renderer(win, `(() => { const el = Array.from(document.querySelectorAll('[data-timeline-body] .group')).filter(el => el.querySelector('[data-testid="trim-handle-left"]') && el.getBoundingClientRect().height < 60).find(el => el.textContent.includes(${JSON.stringify(label)})); const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`); };
  const rowRect = (label) => renderer(win, `(() => { const row = Array.from(document.querySelectorAll('.workspace-row')).find(r => r.querySelector('.workspace-row-label')?.textContent.trim() === ${JSON.stringify(label)}); const r = row.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  async function drag(from, to) {
    const send = (type, x, y) => win.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
    send('mouseMove', from.x, from.y);
    send('mouseDown', from.x, from.y);
    for (let i = 1; i <= 12; i++) { send('mouseMove', from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12); await delay(25); }
    send('mouseUp', to.x, to.y);
    await delay(400);
  }

  check('Audio clips sit on A1 and A2 with an empty A3 to drop onto', JSON.stringify(await trackLabels()) === '["A1","A2","A3"]', JSON.stringify(await trackLabels()));

  // One clip card, showing timeline time.
  for (const label of ['0.2s', '3.6s', '2.2s', '0.2s', '2.2s']) {
    const r = await itemRect(label);
    await drag({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
  }
  const cards = await renderer(win, `document.querySelectorAll('section[aria-label="Seçili bölge"]').length`);
  check('Selecting clips one after another keeps a single clip card', cards === 1, `${cards} card(s)`);
  check('The clip card shows edited-timeline times', await renderer(win, `document.querySelector('[data-testid="region-start"]').value`) === '2.20', await renderer(win, `document.querySelector('[data-testid="region-start"]').value`));

  // Short clips: the middle stays grabbable for moving.
  const short = await itemRect('3.6s');
  const handles = await renderer(win, `(() => { const el = Array.from(document.querySelectorAll('[data-timeline-body] .group')).filter(el => el.querySelector('[data-testid="trim-handle-left"]') && el.getBoundingClientRect().height < 60).find(el => el.textContent.includes('3.6s')); return Array.from(el.querySelectorAll('[data-testid^="trim-handle"]')).reduce((sum, h) => sum + h.getBoundingClientRect().width, 0); })()`);
  check('Trim handles leave the middle of a short clip free to grab', handles <= short.w * 0.5, `${handles.toFixed(1)} of ${short.w.toFixed(1)} px`);

  // Drag audio-1 from A1 onto A3 with the mouse.
  await renderer(win, `document.querySelector('[data-timeline-body]').scrollTop = 10000`);
  await delay(200);
  const first = await itemRect('0.2s');
  const a3 = await rowRect('A3');
  await drag({ x: first.x + first.w / 2, y: first.y + first.h / 2 }, { x: first.x + first.w / 2, y: a3.y + a3.h / 2 });
  let editor = await saved((e) => e.audioRegions.find((r) => r.id === 'audio-1')?.track === 2);
  const moved = editor.audioRegions.find((r) => r.id === 'audio-1');
  check('Dragging a clip onto another track moves it there and keeps its time', moved.track === 2 && Math.abs(moved.startMs - 200) < 120, JSON.stringify(moved));

  // Move audio-2 to A1 from the clip card.
  const second = await itemRect('2.2s');
  await drag({ x: second.x + second.w / 2, y: second.y + second.h / 2 }, { x: second.x + second.w / 2, y: second.y + second.h / 2 });
  await renderer(win, `(() => { const s = document.querySelector('[data-testid="audio-track"]'); s.value = '0'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  editor = await saved((e) => e.audioRegions.find((r) => r.id === 'audio-2')?.track === undefined);
  check('The clip card moves a clip to another track', editor.audioRegions.find((r) => r.id === 'audio-2').track === undefined);
  // Dropping a clip over another clip on the same track never leaves them overlapping.
  await renderer(win, `document.querySelector('[data-timeline-body]').scrollTop = 10000`);
  await delay(200);
  const onA3 = await itemRect('0.2s');
  const target = await itemRect('2.2s');
  const a1 = await rowRect('A1');
  await drag({ x: onA3.x + onA3.w / 2, y: onA3.y + onA3.h / 2 }, { x: target.x + 10, y: a1.y + a1.h / 2 });
  editor = await saved();
  const spans = editor.audioRegions.map((r) => ({ id: r.id, track: r.track ?? 0, start: r.startMs, end: r.endMs }));
  const overlapping = spans.some((a) => spans.some((b) => a.id !== b.id && a.track === b.track && a.start < b.end && b.start < a.end));
  check('Clips on one track never overlap after a drop', !overlapping, JSON.stringify(spans));
  await fs.writeFile(path.join(artifacts, 'timeline-tracks.png'), (await win.webContents.capturePage()).toPNG());
})()
  .catch(async (error) => {
    report.errors.push(String(error?.stack || error));
    console.error(error);
    const win = findWindow('editor');
    if (win) await fs.writeFile(path.join(artifacts, 'timeline-tracks-failure.png'), (await win.webContents.capturePage()).toPNG()).catch(() => undefined);
  })
  .finally(async () => {
    await fs.writeFile(path.join(artifacts, 'timeline-tracks-report.json'), JSON.stringify(report, null, 2));
    const failed = report.errors.length > 0 || report.checks.some((entry) => !entry.passed);
    console.log(`TIMELINE_TRACKS ${failed ? 'FAILED' : 'PASSED'}`);
    app.exit(failed ? 1 : 0);
  });
