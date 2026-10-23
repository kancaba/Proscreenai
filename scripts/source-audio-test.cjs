// Checks the recording-sound control: mute and 50 % volume in the preview and in the export
// (no audio track when muted; about -6 dB at 50 %), and that the change can be undone.
// Uses the speech video from auto-captions-test. Isolated profile. Run after `npx vite build`.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
app.setPath('userData', path.join(artifacts, 'source-audio-profile'));
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

async function newestExport(sinceMs) {
  const dir = path.join(app.getPath('userData'), 'recordings');
  let last = null;
  return waitFor(async () => {
    const names = (await fs.readdir(dir).catch(() => [])).filter((name) => name.endsWith('.mp4'));
    const stats = await Promise.all(names.map(async (name) => ({ file: path.join(dir, name), stat: await fs.stat(path.join(dir, name)) })));
    const fresh = stats.filter((e) => e.stat.mtimeMs >= sinceMs - 1000).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0];
    if (!fresh) return null;
    if (last && last.file === fresh.file && last.size === fresh.stat.size) return fresh.file;
    last = { file: fresh.file, size: fresh.stat.size };
    return null;
  }, 240000);
}
/** Mean volume in dB, or null when the file has no audio stream. */
function meanVolume(file) {
  const out = spawnSync(ffmpeg, ['-hide_banner', '-i', file, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  if (!/Audio:/.test(out)) return null;
  const match = out.match(/mean_volume: (-?[\d.]+) dB/);
  return match ? Number(match[1]) : null;
}

(async () => {
  await fs.rm(path.join(artifacts, 'source-audio-profile'), { recursive: true, force: true });
  const video = path.join(artifacts, 'auto-captions', 'speech-sample.mp4');
  const original = meanVolume(video);
  check('Sample has sound', original !== null, `${original} dB`);

  await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href);
  await app.whenReady();
  const welcome = await waitFor(() => findWindow('welcome'));
  await waitFor(() => renderer(welcome, `document.body.innerText.includes('Video içe aktar')`));
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [video] });
  await renderer(welcome, `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Video içe aktar')).click()`);
  const win = await waitFor(() => findWindow('editor'));
  await waitFor(() => renderer(win, `!!document.querySelector('video') && document.querySelector('video').readyState >= 2`));
  await delay(1500);
  await renderer(win, `Array.from(document.querySelectorAll('[role="tab"]')).find(t => t.textContent.includes('Ses')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="source-audio-mute"]')`));

  const exportNow = async () => {
    const started = Date.now();
    await renderer(win, `Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('dışa aktar')).click()`);
    await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="confirm-export"]')`));
    await renderer(win, `document.querySelector('[data-testid="confirm-export"]').click()`);
    const file = await newestExport(started);
    await delay(800);
    await renderer(win, `document.querySelector('[role="dialog"] button[aria-label="Close"], [role="dialog"] button')?.click()`).catch(() => undefined);
    await renderer(win, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await delay(800);
    return file;
  };

  await renderer(win, `document.querySelector('[data-testid="source-audio-mute"]').click()`);
  await delay(300);
  check('Mute silences the preview', await renderer(win, `document.querySelector('video').muted === true`));
  const mutedExport = await exportNow();
  check('A muted export has no audio track', meanVolume(mutedExport) === null, path.basename(mutedExport));

  await renderer(win, `document.querySelector('button[aria-label="Geri al"]').click()`);
  await delay(400);
  check('Undo restores the sound', await renderer(win, `document.querySelector('video').muted === false && document.querySelector('video').volume === 1`));

  // 50 %: type it into the slider's value field.
  await renderer(win, `document.querySelector('[data-testid="source-audio"] button[aria-label$="değerini düzenle"]').click()`);
  await delay(300);
  const halfSet = await renderer(win, `(() => {
    const input = document.querySelector('[data-testid="source-audio"] input[type="text"]');
    if (!input) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '50');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  })()`);
  await delay(500);
  const volume = await renderer(win, `document.querySelector('video').volume`);
  check('Volume slider sets the preview volume', halfSet && Math.abs(volume - 0.5) < 0.02, String(volume));
  const halfExport = await exportNow();
  const half = meanVolume(halfExport);
  check('A 50 % export is about 6 dB quieter', half !== null && Math.abs(original - half - 6) < 2, `${original} → ${half} dB`);
})()
  .catch((error) => {
    report.errors.push(String(error?.stack || error));
    console.error(error);
  })
  .finally(async () => {
    await fs.writeFile(path.join(artifacts, 'source-audio-report.json'), JSON.stringify(report, null, 2));
    const failed = report.errors.length > 0 || report.checks.some((entry) => !entry.passed);
    console.log(`SOURCE_AUDIO ${failed ? 'FAILED' : 'PASSED'}`);
    app.exit(failed ? 1 : 0);
  });
