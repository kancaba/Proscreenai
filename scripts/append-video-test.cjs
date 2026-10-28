// Adding videos to the end of the edit: "Video ekle" joins a video of the same kind (no
// re-encoding) and then one of another size with its own sound (re-encoded); earlier cuts and
// speeds keep their place, each video is labelled on the timeline, the cursor/key data follows,
// and the export has every video. Then "Yeni kayıt çek ve sona ekle" closes the editor for the
// recorder, a finished recording (simulated the way the recorder reports one) comes back to the
// end of the same project, and closing the recorder instead brings the project back unchanged.
// Isolated profile; run after `npx vite build`.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const profile = path.join(artifacts, 'append-profile');
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

(async () => {
  await fs.rm(profile, { recursive: true, force: true });
  const media = path.join(artifacts, 'append-media');
  await fs.rm(media, { recursive: true, force: true });
  await fs.mkdir(media, { recursive: true });
  // A: the 6 s sample with key presses at 1 s; B: the same sample with key presses at 0.5 s;
  // C: 3 s at 640×480 with a tone; D: a 2 s "recording" made later.
  const a = path.join(media, 'append-a.mp4');
  const b = path.join(media, 'append-b.mp4');
  const c = path.join(media, 'append-c.mp4');
  const d = path.join(media, 'append-d.mp4');
  await fs.copyFile(path.join(artifacts, 'sample.mp4'), a);
  await fs.copyFile(path.join(artifacts, 'sample.mp4'), b);
  await fs.writeFile(`${a}.cursor.json`, JSON.stringify({ version: 2, samples: [{ timeMs: 1000, cx: 0.2, cy: 0.2, interactionType: 'move' }], keys: [1000, 1100] }));
  await fs.writeFile(`${b}.cursor.json`, JSON.stringify({ version: 2, samples: [{ timeMs: 500, cx: 0.8, cy: 0.8, interactionType: 'move' }], keys: [500] }));
  for (const [file, size, seconds, tone] of [[c, '640x480', 3, 440], [d, '1280x720', 2, 660]]) {
    const made = spawnSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30:duration=${seconds}`, '-f', 'lavfi', '-i', `sine=frequency=${tone}:duration=${seconds}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file]);
    if (made.status !== 0) throw new Error(`Could not make ${file}`);
  }

  // The project already has a cut (1–2 s) and a 2× part (3–4 s) on video A.
  const projectPath = path.join(media, 'append.screenmovie');
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
  let win = await waitFor(() => findWindow('editor'));
  const ready = (w) => waitFor(() => renderer(w, `!!document.querySelector('video') && document.querySelector('video').readyState >= 2`));
  await ready(win);
  await delay(1500);

  const total = (w) => renderer(w, `(document.body.innerText.match(/\\d+[.,]\\d+ \\/ (\\d+[.,]\\d+)s/) || [])[1] || ''`).then((text) => Number(text.replace(',', '.')));
  // A re-encoded video can come out a frame or two longer.
  const about = (value, expected) => Math.abs(value - expected) <= 0.25;
  const labels = (w) => renderer(w, `Array.from(document.querySelectorAll('[data-testid="video-label"]')).map(l => l.textContent).join(' | ')`);
  async function saved(w, predicate = () => true) {
    await fs.rm(projectPath, { force: true });
    w.webContents.send('menu-save-project');
    return waitFor(async () => {
      const data = JSON.parse(await fs.readFile(projectPath, 'utf8').catch(() => '{}'));
      return data.editor && predicate(data) ? data : null;
    });
  }
  async function addVideoFromFile(w, file, expectedTotal) {
    pick = file;
    await renderer(w, `(() => { const t = document.querySelector('[data-testid="add-video"]'); t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })); })()`);
    await waitFor(() => renderer(w, `!!document.querySelector('[data-testid="add-video-file"]')`), 5000);
    await renderer(w, `document.querySelector('[data-testid="add-video-file"]').click()`);
    await waitFor(async () => about(await total(w), expectedTotal), 120000);
    await ready(w);
  }

  check('The project opens at its edited length', about(await total(win), 4.5), await total(win)); // 6 − 1 cut − 0.5 sped up

  await addVideoFromFile(win, b, 10.5);
  check('Adding a video of the same kind makes the edit 6 s longer', true);
  check('Both videos are labelled on the video track', (await labels(win)) === 'append-a.mp4 | append-b.mp4', await labels(win));

  await addVideoFromFile(win, c, 13.5);
  check('A video of another size is added too', true);
  check('Three videos are labelled, with two boundaries', (await labels(win)) === 'append-a.mp4 | append-b.mp4 | append-c.mp4'
    && (await renderer(win, `document.querySelectorAll('[data-testid="video-boundary"]').length`)) === 2, await labels(win));
  await fs.writeFile(path.join(artifacts, 'append-video.png'), (await win.webContents.capturePage()).toPNG());

  let project = await saved(win);
  const joined = project.videoPath;
  const joinedProbe = probe(joined);
  check('The project now edits the joined video', /-montaj-\d{8}-\d{6}\.mp4$/.test(joined) && path.dirname(joined) === path.join(profile, 'recordings'), joined);
  check('The joined video has the first video\'s size, every second and sound', /1280x720/.test(joinedProbe) && Math.abs(seconds(joinedProbe) - 15) < 0.3 && /Audio: aac/.test(joinedProbe), `${seconds(joinedProbe)} s`);
  check('Earlier edits keep their place', JSON.stringify(project.editor.trimRegions.map((r) => [r.startMs, r.endMs])) === '[[1000,2000]]'
    && JSON.stringify(project.editor.speedRegions.map((r) => [r.startMs, r.endMs, r.speed])) === '[[3000,4000,2]]');
  // The second join ends a frame or so later than 12 s.
  const near = (value, expected) => Math.abs(value - expected) < 200;
  check('Each added video is its own part', project.editor.clipSplits.length === 2 && project.editor.clipSplits[0] === 6000 && near(project.editor.clipSplits[1], 12000), JSON.stringify(project.editor.clipSplits));
  check('The project remembers which videos it joined', project.editor.videoClips.map((clip) => clip.name).join() === 'append-a.mp4,append-b.mp4,append-c.mp4' && project.editor.videoClips[1].startMs === 6000 && near(project.editor.videoClips[2].startMs, 12000), JSON.stringify(project.editor.videoClips));
  const telemetry = JSON.parse(await fs.readFile(`${joined}.cursor.json`, 'utf8'));
  check('Cursor and key data move with their video', JSON.stringify(telemetry.keys) === '[1000,1100,6500]' && telemetry.samples.map((s) => s.timeMs).join(',') === '1000,6500', JSON.stringify(telemetry.keys));
  check('The original videos are untouched', Math.abs(seconds(probe(a)) - 6) < 0.1 && Math.abs(seconds(probe(c)) - 3) < 0.1);

  // Export: 15 s minus the 1 s cut and 0.5 s saved by the 2× part.
  const exportStarted = Date.now();
  await renderer(win, `Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('dışa aktar')).click()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="confirm-export"]')`));
  await renderer(win, `document.querySelector('[data-testid="confirm-export"]').click()`);
  const recordings = path.join(profile, 'recordings');
  const exported = await waitFor(async () => {
    for (const name of (await fs.readdir(recordings)).filter((n) => n.endsWith('.mp4') && !n.includes('-montaj-'))) {
      const stat = await fs.stat(path.join(recordings, name));
      if (stat.mtimeMs >= exportStarted - 1000 && stat.size > 1000) return path.join(recordings, name);
    }
    return null;
  }, 240000);
  await delay(2500);
  const exportedSeconds = seconds(probe(exported));
  check('The export has all three videos', Math.abs(exportedSeconds - 13.5) < 0.4, `${exportedSeconds} s`);

  // "Yeni kayıt çek ve sona ekle", then closing the recorder: the project comes back as it was.
  async function recordAndAppend() {
    await renderer(win, `(() => { const t = document.querySelector('[data-testid="add-video"]'); t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })); })()`);
    await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="add-video-record"]')`), 5000);
    await renderer(win, `document.querySelector('[data-testid="add-video-record"]').click()`);
    const hud = await waitFor(() => findWindow('hud-overlay'));
    check('The recorder opens in place of the editor', !findWindow('editor'));
    await waitFor(() => renderer(hud, `!!window.electronAPI`));
    return hud;
  }
  let hud = await recordAndAppend();
  await renderer(hud, `window.electronAPI.hudOverlayClose()`);
  win = await waitFor(() => findWindow('editor'));
  await ready(win);
  await waitFor(async () => about(await total(win), 13.5), 20000);
  check('Closing the recorder brings the project back unchanged', (await labels(win)).split(' | ').length === 3, await labels(win));

  // Recording finished: the recorder reports its file and switches to the editor.
  hud = await recordAndAppend();
  // The recorder window closes on the way, so its answer never comes; do not wait for it.
  renderer(hud, `(async () => { await window.electronAPI.setCurrentVideoPath(${JSON.stringify(d)}); await window.electronAPI.switchToEditor(); })()`).catch(() => undefined);
  win = await waitFor(() => findWindow('editor'));
  await ready(win);
  await waitFor(async () => about(await total(win), 15.5), 120000);
  check('A new recording comes back to the end of the same project', (await labels(win)) === 'append-a.mp4 | append-b.mp4 | append-c.mp4 | append-d.mp4', await labels(win));
  project = await saved(win, (data) => (data.editor.videoClips ?? []).length === 4);
  check('…keeping the project file and its edits', project.editor.trimRegions.length === 1 && project.editor.clipSplits.length === 3 && near(project.editor.clipSplits[2], 15000), JSON.stringify(project.editor.clipSplits));
  await fs.writeFile(path.join(artifacts, 'append-video-recorded.png'), (await win.webContents.capturePage()).toPNG());
})()
  .catch(async (error) => {
    report.errors.push(String(error?.stack || error));
    console.error(error);
    const win = findWindow('editor');
    if (win) await fs.writeFile(path.join(artifacts, 'append-video-failure.png'), (await win.webContents.capturePage()).toPNG()).catch(() => undefined);
  })
  .finally(async () => {
    await fs.writeFile(path.join(artifacts, 'append-video-report.json'), JSON.stringify(report, null, 2));
    const failed = report.errors.length > 0 || report.checks.some((entry) => !entry.passed);
    console.log(`APPEND_VIDEO ${failed ? 'FAILED' : 'PASSED'}`);
    app.exit(failed ? 1 : 0);
  });
