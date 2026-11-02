// Moving parts of the edit: a video added "at the start" lands before the recording, a part
// dragged along the video track and the part card's "Başa taşı" move it, and a video added at the
// playhead goes inside the recording. Each time the cuts, speeds, part splits, video labels and
// the cursor/key data move with their part, the rebuilt file has every second and sound, and the
// move is not an undo step. Isolated profile; run after `npx vite build`.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const profile = path.join(artifacts, 'move-part-profile');
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
const probe = (file) => spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' }).stderr;
const seconds = (text) => { const m = text.match(/Duration: (\d+):(\d+):([\d.]+)/); return m ? Number(m[2]) * 60 + Number(m[3]) : -1; };
// A re-encoded video can come out a frame or two longer.
const near = (value, expected, slack = 200) => Math.abs(value - expected) <= slack;
const spans = (regions) => JSON.stringify(regions.map((r) => [r.startMs, r.endMs, ...(r.speed ? [r.speed] : [])]));

(async () => {
  await fs.rm(profile, { recursive: true, force: true });
  const media = path.join(artifacts, 'move-part-media');
  await fs.rm(media, { recursive: true, force: true });
  await fs.mkdir(media, { recursive: true });
  // A: the 6 s sample with key presses at 1 s; C: 3 s at 640×480 with a tone; D: 2 s at 1280×720.
  const a = path.join(media, 'part-a.mp4');
  const c = path.join(media, 'part-c.mp4');
  const d = path.join(media, 'part-d.mp4');
  await fs.copyFile(path.join(artifacts, 'sample.mp4'), a);
  await fs.writeFile(`${a}.cursor.json`, JSON.stringify({ version: 2, samples: [{ timeMs: 1000, cx: 0.2, cy: 0.2, interactionType: 'move' }], keys: [1000, 1100] }));
  for (const [file, size, length, tone] of [[c, '640x480', 3, 440], [d, '1280x720', 2, 660]]) {
    const made = spawnSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30:duration=${length}`, '-f', 'lavfi', '-i', `sine=frequency=${tone}:duration=${length}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file]);
    if (made.status !== 0) throw new Error(`Could not make ${file}`);
  }

  // The project has a cut (1–2 s) and a 2× part (3–4 s) on video A.
  const projectPath = path.join(media, 'move.screenmovie');
  await fs.writeFile(projectPath, JSON.stringify({
    version: 1,
    videoPath: a,
    editor: { trimRegions: [{ id: 'trim-1', startMs: 1000, endMs: 2000 }], speedRegions: [{ id: 'speed-1', startMs: 3000, endMs: 4000, speed: 2 }] },
  }));

  await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href);
  await app.whenReady();
  let pick = projectPath;
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [pick] });
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: projectPath });
  const welcome = await waitFor(() => findWindow('welcome'));
  await waitFor(() => renderer(welcome, `document.body.innerText.includes('Proje')`));
  await renderer(welcome, `Array.from(document.querySelectorAll('button')).find(b => /Proje aç/.test(b.textContent)).click()`);
  const win = await waitFor(() => findWindow('editor'));
  const ready = () => waitFor(() => renderer(win, `!!document.querySelector('video') && document.querySelector('video').readyState >= 2`));
  await ready();
  await delay(1500);

  const videoFile = () => renderer(win, `decodeURIComponent(document.querySelector('video').src)`);
  const labels = () => renderer(win, `Array.from(document.querySelectorAll('[data-testid="video-label"]')).map(l => l.textContent).join(' | ')`);
  const canUndo = () => renderer(win, `!document.querySelector('[aria-label="Geri al"]').disabled`);
  async function saved(predicate = () => true) {
    await fs.rm(projectPath, { force: true });
    win.webContents.send('menu-save-project');
    return waitFor(async () => {
      const data = JSON.parse(await fs.readFile(projectPath, 'utf8').catch(() => '{}'));
      return data.editor && predicate(data) ? data : null;
    });
  }
  /** Waits until the editor plays a new video file. */
  async function newVideo(before) {
    await waitFor(async () => (await videoFile()) !== before, 120000);
    await ready();
    await delay(800);
  }
  async function addVideo(file, item) {
    pick = file;
    const before = await videoFile();
    await renderer(win, `(() => { const t = document.querySelector('[data-testid="add-video"]'); t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })); })()`);
    await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="${item}"]')`), 5000);
    await renderer(win, `document.querySelector('[data-testid="${item}"]').click()`);
    await waitFor(async () => (await labels()).includes(path.basename(file)), 120000);
    await newVideo(before);
  }
  const telemetryKeys = async (project) => JSON.parse(await fs.readFile(`${project.videoPath}.cursor.json`, 'utf8')).keys;

  // 1. C added at the start: C (3 s), then A with its cut and speed 3 s later.
  await addVideo(c, 'add-video-file-start');
  check('A video added at the start comes first', (await labels()) === 'part-c.mp4 | part-a.mp4', await labels());
  let project = await saved();
  // C's real length (a frame or so over 3 s) is how far everything after it moved.
  const cLen = project.editor.videoClips[1]?.startMs ?? 0;
  const at = (...times) => JSON.stringify(times);
  const rebuilt = probe(project.videoPath);
  check('The rebuilt video has both videos, the first one\'s size and sound', /1280x720/.test(rebuilt) && Math.abs(seconds(rebuilt) - 9) < 0.3 && /Audio: aac/.test(rebuilt), `${seconds(rebuilt)} s`);
  check('The cut and the speed moved with the recording', spans(project.editor.trimRegions) === `[${at(1000 + cLen, 2000 + cLen)}]` && spans(project.editor.speedRegions) === `[${at(3000 + cLen, 4000 + cLen, 2)}]`, `C ${cLen} ms: ${spans(project.editor.trimRegions)} ${spans(project.editor.speedRegions)}`);
  check('Part splits and video labels follow', near(cLen, 3000, 100) && JSON.stringify(project.editor.clipSplits) === at(cLen) && project.editor.videoClips.map((v) => v.name).join() === 'part-c.mp4,part-a.mp4', JSON.stringify(project.editor.videoClips));
  check('Cursor and key data moved too', JSON.stringify(await telemetryKeys(project)) === at(1000 + cLen, 1100 + cLen), JSON.stringify(await telemetryKeys(project)));
  check('Adding and moving is not an undo step', !(await canUndo()));
  await fs.writeFile(path.join(artifacts, 'move-part-start.png'), (await win.webContents.capturePage()).toPNG());

  // 2. C dragged along the track to the end.
  let before = await videoFile();
  await renderer(win, `(() => {
    const track = document.querySelector('[data-testid="source-video-track"]').getBoundingClientRect();
    const part = document.querySelector('[data-testid="clip-segment"][data-start="0"]').getBoundingClientRect();
    const y = part.top + part.height / 2;
    const at = (x) => ({ bubbles: true, button: 0, pointerType: 'mouse', clientX: x, clientY: y });
    document.querySelector('[data-testid="clip-segment"][data-start="0"]').dispatchEvent(new PointerEvent('pointerdown', at(part.left + 10)));
    window.dispatchEvent(new PointerEvent('pointermove', at(part.left + 40)));
    window.dispatchEvent(new PointerEvent('pointermove', at(track.right - 4)));
  })()`);
  // The edited end: C, then A without its 1 s cut and with 0.5 s saved by the 2× part.
  const target = Number(await renderer(win, `document.querySelector('[data-testid="clip-drop-target"]')?.dataset.target`));
  const editedEnd = await renderer(win, `Math.round(document.querySelector('video').duration * 1000) - 1500`);
  check('Dragging shows where the part will go (the end)', near(target, editedEnd, 20), `${target} of ${editedEnd}`);
  await fs.writeFile(path.join(artifacts, 'move-part-drag.png'), (await win.webContents.capturePage()).toPNG());
  await renderer(win, `window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }))`);
  await newVideo(before);
  check('The dragged part is now at the end', (await labels()) === 'part-a.mp4 | part-c.mp4', await labels());
  project = await saved((data) => data.videoPath !== before.replace(/^file:\/\//, ''));
  check('…and the recording\'s edits are back at their own times', spans(project.editor.trimRegions) === '[[1000,2000]]' && spans(project.editor.speedRegions) === '[[3000,4000,2]]' && JSON.stringify(await telemetryKeys(project)) === '[1000,1100]', `${spans(project.editor.trimRegions)} ${spans(project.editor.speedRegions)}`);
  check('The moved part stays selected in its new place', await renderer(win, `!!document.querySelector('[data-testid="clip-part-inspector"]')`));

  // 3. "Başa taşı" on the part card.
  before = await videoFile();
  await renderer(win, `document.querySelector('[data-testid="clip-part-move-start"]').click()`);
  await newVideo(before);
  check('"Başa taşı" puts the part first', (await labels()) === 'part-c.mp4 | part-a.mp4', await labels());

  // 4. D added at the playhead, half a second into the recording (before its cut).
  await renderer(win, `document.querySelector('video').currentTime = ${(cLen + 500) / 1000}`);
  await delay(800);
  await addVideo(d, 'add-video-file-playhead');
  check('A video added at the playhead goes inside the recording', (await labels()) === 'part-c.mp4 | part-a.mp4 | part-d.mp4 | part-a.mp4', await labels());
  project = await saved((data) => (data.editor.videoClips ?? []).length === 4);
  const full = probe(project.videoPath);
  const dLen = project.editor.videoClips[3].startMs - project.editor.videoClips[2].startMs;
  check('Every second is there (3 + 6 + 2 s)', Math.abs(seconds(full) - 11) < 0.4, `${seconds(full)} s`);
  check('D sits at the playhead, the cut and the speed after it move on by D\'s length', near(dLen, 2000, 100) && project.editor.videoClips[2].startMs === cLen + 500
    && spans(project.editor.trimRegions) === `[${at(1000 + cLen + dLen, 2000 + cLen + dLen)}]` && spans(project.editor.speedRegions) === `[${at(3000 + cLen + dLen, 4000 + cLen + dLen, 2)}]`, `${JSON.stringify(project.editor.videoClips)} ${spans(project.editor.trimRegions)} ${spans(project.editor.speedRegions)}`);
  check('The recording is split around the added video', JSON.stringify(project.editor.clipSplits) === at(cLen, cLen + 500, cLen + 500 + dLen), JSON.stringify(project.editor.clipSplits));
  check('Still no undo step for the moves', !(await canUndo()));
  await fs.writeFile(path.join(artifacts, 'move-part-playhead.png'), (await win.webContents.capturePage()).toPNG());
})()
  .catch(async (error) => {
    report.errors.push(String(error?.stack || error));
    console.error(error);
    const win = findWindow('editor');
    if (win) await fs.writeFile(path.join(artifacts, 'move-part-failure.png'), (await win.webContents.capturePage()).toPNG()).catch(() => undefined);
  })
  .finally(async () => {
    await fs.writeFile(path.join(artifacts, 'move-part-report.json'), JSON.stringify(report, null, 2));
    const failed = report.errors.length > 0 || report.checks.some((entry) => !entry.passed);
    console.log(`MOVE_VIDEO_PART ${failed ? 'FAILED' : 'PASSED'}`);
    app.exit(failed ? 1 : 0);
  });
