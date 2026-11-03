// Generated voiceovers stay with the project: a stray click outside does not close the panel,
// a generation is still listed after the panel is closed and reopened, it can be added at the
// start when the playhead is at the video's end, and it is saved in the project file. Modelion's
// HTTP is replaced by a local tone; isolated profile; run after `npx vite build`.
const { app, BrowserWindow, dialog, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const profile = path.join(artifacts, 'voiceover-takes-profile');
app.setPath('userData', profile);
app.getAppPath = () => root;
safeStorage.isEncryptionAvailable = () => false;
const ffmpeg = require('ffmpeg-static');
const media = path.join(artifacts, 'voiceover-takes-media');
const tone = path.join(media, 'tone.mp3');
const realFetch = global.fetch;
global.fetch = async (url, options) => {
  if (String(url).startsWith('https://gateway.tr-west-1.modelion.ai/v1/audio/speech')) return new Response(await fs.readFile(tone), { headers: { 'Content-Type': 'audio/mpeg' } });
  return realFetch(url, options);
};

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
    await delay(150);
  }
  throw new Error('Timed out waiting for application state');
}
const renderer = (win, code) => win.webContents.executeJavaScript(code, true);
const findWindow = (part) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes(part));

(async () => {
  await fs.rm(profile, { recursive: true, force: true });
  await fs.rm(media, { recursive: true, force: true });
  await fs.mkdir(media, { recursive: true });
  const video = path.join(media, 'source.mp4');
  spawnSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
  spawnSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=800:duration=1.5', '-ac', '1', tone]);
  const projectPath = path.join(media, 'takes.screenmovie');
  await fs.writeFile(projectPath, JSON.stringify({ version: 1, videoPath: video, editor: {} }));

  await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href);
  await app.whenReady();
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [projectPath] });
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: projectPath });
  const welcome = await waitFor(() => findWindow('welcome'));
  await waitFor(() => renderer(welcome, `document.body.innerText.includes('Proje')`));
  await renderer(welcome, `window.electronAPI.modelionSaveKey('test-only-voiceover-takes')`);
  await renderer(welcome, `Array.from(document.querySelectorAll('button')).find(b => /Proje aç/.test(b.textContent)).click()`);
  const win = await waitFor(() => findWindow('editor'));
  await waitFor(() => renderer(win, `!!document.querySelector('video') && document.querySelector('video').readyState >= 2`));
  await delay(1200);
  // The playhead at the very end, as after watching the video through.
  await renderer(win, `(() => { const v = document.querySelector('video'); v.currentTime = v.duration - 0.04; })()`);
  await delay(600);

  const openPanel = async () => {
    await renderer(win, `document.querySelector('button[aria-label="Seslendir"]').click()`);
    await waitFor(() => renderer(win, `!!document.querySelector('#voiceover-text')`));
    await delay(300);
  };
  const panelOpen = () => renderer(win, `!!document.querySelector('#voiceover-text')`);
  await openPanel();
  await renderer(win, `(() => { const t = document.querySelector('#voiceover-text'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, 'Fatura listesinde VKN bilgileri gizlendi.'); t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor(() => renderer(win, `!document.querySelector('[data-testid="generate-speech"]').disabled`), 5000);
  await renderer(win, `document.querySelector('[data-testid="generate-speech"]').click()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="add-voiceover-start"]')`));
  check('At the video end, "add at playhead" is off and "add at start" is offered', await renderer(win, `document.querySelector('[data-testid="add-voiceover"]').disabled`));
  await fs.writeFile(path.join(artifacts, 'voiceover-takes-result.png'), (await win.webContents.capturePage()).toPNG());

  // A stray click on the dimmed editor around the panel.
  win.webContents.sendInputEvent({ type: 'mouseDown', x: 20, y: 300, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: 20, y: 300, button: 'left', clickCount: 1 });
  await delay(500);
  check('A click outside does not close the panel', await panelOpen());

  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await waitFor(async () => !(await panelOpen()), 5000);
  await openPanel();
  const listed = await renderer(win, `Array.from(document.querySelectorAll('[data-testid="voiceover-take"]')).map(li => li.innerText)`);
  check('After closing and reopening, the generated voiceover is still listed', listed.length === 1 && listed[0].includes('VKN bilgileri'), JSON.stringify(listed));
  await fs.writeFile(path.join(artifacts, 'voiceover-takes-list.png'), (await win.webContents.capturePage()).toPNG());

  await renderer(win, `document.querySelector('[data-testid="take-add-start"]').click()`);
  await waitFor(async () => !(await panelOpen()), 5000);
  await waitFor(() => renderer(win, `document.body.innerText.includes('Ema Lightning seslendirme')`), 5000);
  check('A listed voiceover is added to the timeline', true);

  await fs.rm(projectPath, { force: true });
  win.webContents.send('menu-save-project');
  const saved = await waitFor(async () => JSON.parse(await fs.readFile(projectPath, 'utf8').catch(() => '{}')).editor);
  const takes = saved.voiceoverTakes ?? [];
  check('The voiceover is saved with the project', takes.length === 1 && takes[0].text.includes('VKN') && takes[0].durationMs > 1000, JSON.stringify(takes));
  check('It was added at the start', saved.audioRegions?.length === 1 && saved.audioRegions[0].startMs === 0, JSON.stringify(saved.audioRegions));
})()
  .catch((error) => {
    report.errors.push(String(error?.stack || error));
    console.error(error);
  })
  .finally(async () => {
    await fs.writeFile(path.join(artifacts, 'voiceover-takes-report.json'), JSON.stringify(report, null, 2));
    app.exit(report.errors.length || report.checks.some((c) => !c.passed) ? 1 : 0);
  });
