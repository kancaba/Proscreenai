// End-to-end check of automatic captions: builds a video with Turkish speech (macOS "Yelda"
// voice, known sentence timings), presses "Create captions from speech" in the editor and
// checks the captions, their timing, replacing an earlier run, undo and cancel.
// macOS 26+ only. Isolated profile. Run after `npx vite build`.
const { app, BrowserWindow, dialog } = require('electron');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const work = path.join(artifacts, 'auto-captions');
app.setPath('userData', path.join(artifacts, 'auto-captions-profile'));
// Electron treats the script folder as the app folder; point it at the repo for assets.
app.getAppPath = () => root;
const ffmpeg = require('ffmpeg-static');

const report = { checks: [], errors: [] };
function check(name, passed, detail) {
  report.checks.push({ name, passed: !!passed, ...(detail === undefined ? {} : { detail }) });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : `: ${detail}`}`);
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let currentStep = '';
const step = (name) => { currentStep = name; console.log(`STEP ${name}`); };
async function waitFor(getter, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await getter();
    if (value) return value;
    await delay(200);
  }
  throw new Error(`Timed out waiting for application state (${currentStep})`);
}
const renderer = (win, code) => win.webContents.executeJavaScript(code, true);
const findWindow = (part) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes(part));

const SENTENCES = [
  'Merhaba, bu videoda ekran kaydının nasıl yapıldığını göstereceğim.',
  'Önce sağ üstteki kayıt düğmesine tıklıyorum.',
  'Sonra kaydetmek istediğim pencereyi seçiyorum.',
  'Kayıt bittikten sonra editör kendiliğinden açılıyor.',
  'Son olarak videoyu dışa aktarıyoruz.',
];

/** Speech track with 0.9 s pauses; returns each sentence's true speech start and end. */
async function buildSample() {
  await fs.mkdir(work, { recursive: true });
  const RATE = 16000;
  const parts = [Buffer.alloc(RATE)]; // 0.5 s lead-in
  let t = 0.5;
  const truth = [];
  for (const [index, sentence] of SENTENCES.entries()) {
    const aiff = path.join(work, `s${index}.aiff`);
    execFileSync('say', ['-v', 'Yelda', '-r', '175', '-o', aiff, sentence]);
    const raw = execFileSync(ffmpeg, ['-loglevel', 'error', '-i', aiff, '-ac', '1', '-ar', String(RATE), '-f', 's16le', 'pipe:1'], { maxBuffer: 64 * 1024 * 1024 });
    const samples = new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2);
    const first = samples.findIndex((v) => Math.abs(v) > 500);
    let last = samples.length - 1;
    while (last > 0 && Math.abs(samples[last]) <= 500) last -= 1;
    truth.push({ sentence, startMs: Math.round((t + first / RATE) * 1000), endMs: Math.round((t + last / RATE) * 1000) });
    parts.push(raw, Buffer.alloc(Math.round(RATE * 0.9) * 2));
    t += samples.length / RATE + 0.9;
  }
  const pcm = path.join(work, 'speech.raw');
  await fs.writeFile(pcm, Buffer.concat(parts));
  const video = path.join(work, 'speech-sample.mp4');
  execFileSync(ffmpeg, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=1280x720:rate=30:duration=${t.toFixed(2)}`,
    '-f', 's16le', '-ar', String(RATE), '-ac', '1', '-i', pcm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video]);
  return { video, truth };
}

(async () => {
  await fs.rm(path.join(artifacts, 'auto-captions-profile'), { recursive: true, force: true });
  step('sample');
  const { video, truth } = await buildSample();

  await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href);
  await app.whenReady();
  step('welcome');
  const welcome = await waitFor(() => findWindow('welcome'));
  await waitFor(() => renderer(welcome, `document.body.innerText.includes('Video içe aktar')`));
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [video] });
  await renderer(welcome, `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Video içe aktar')).click()`);
  step('editor');
  const win = await waitFor(() => findWindow('editor'));
  await waitFor(() => renderer(win, `!!document.querySelector('video') && document.querySelector('video').readyState >= 2`));
  // Radix tabs switch on mousedown, not click.
  await renderer(win, `Array.from(document.querySelectorAll('[role="tab"]')).find(t => t.textContent.trim() === 'AI').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="auto-captions-generate"]')`));

  const project = path.join(work, 'captions.screenmovie');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: project });
  async function saved(predicate) {
    await fs.rm(project, { force: true });
    win.webContents.send('menu-save-project');
    return waitFor(async () => {
      const data = JSON.parse(await fs.readFile(project, 'utf8').catch(() => '{}'));
      return data.editor && predicate(data.editor) ? data.editor : null;
    });
  }
  const toastText = () => renderer(win, `Array.from(document.querySelectorAll('[data-sonner-toast]')).map(t => t.innerText).join(' | ')`);

  step('generate');
  const started = Date.now();
  await renderer(win, `document.querySelector('[data-testid="auto-captions-generate"]').click()`);
  const stage = await waitFor(() => renderer(win, `document.querySelector('[data-testid="auto-captions-stage"]')?.textContent`), 10000);
  check('Progress is shown while working', true, stage);
  const notice = await waitFor(async () => { const text = await toastText(); return /\d+ altyazı eklendi/.test(text) ? text : null; }, 120000);
  check('Captions are added from speech', true, `${notice.replace(/\s+/g, ' ')} in ${Date.now() - started} ms`);
  const error = await renderer(win, `document.querySelector('[data-testid="auto-captions-error"]')?.textContent || ''`);
  check('No error is shown', !error, error);

  let editor = await saved((e) => e.annotationRegions.length > 0);
  const captions = editor.annotationRegions.filter((r) => r.generatedBy === 'transcript').sort((a, b) => a.startMs - b.startMs);
  report.captions = captions.map((c) => [c.startMs, c.endMs, c.textContent]);
  check('Captions are marked and use the subtitle style', captions.length >= SENTENCES.length && captions.every((c) => c.style.backgroundColor === '#000000b3'), String(captions.length));
  check('First caption starts with a capital letter', /^Merhaba/.test(captions[0].textContent), captions[0].textContent);
  const startErrors = truth.map((sentence) => Math.min(...captions.map((c) => Math.abs(c.startMs - sentence.startMs))));
  check('Every sentence has a caption starting within 150 ms', startErrors.every((e) => e <= 150), startErrors.join(', '));
  const words = captions.map((c) => c.textContent).join(' ').toLocaleLowerCase('tr');
  const expected = ['merhaba', 'ekran', 'kaydının', 'düğmesine', 'pencereyi', 'editör', 'dışa', 'aktarıyoruz'];
  const missing = expected.filter((word) => !words.includes(word));
  check('Key words are recognised', missing.length <= 1, missing.length ? `missing: ${missing.join(', ')}` : 'all found');
  check('Captions do not overlap', captions.every((c, i) => i === 0 || c.startMs >= captions[i - 1].endMs));

  step('replace');
  check('A second run says it replaces the first', await renderer(win, `document.querySelector('[data-testid="auto-captions"]').innerText.includes('yerini alır')`));
  await renderer(win, `document.querySelector('[data-testid="auto-captions-generate"]').click()`);
  await delay(300);
  await waitFor(() => renderer(win, `!document.querySelector('[data-testid="auto-captions-stage"]')`), 120000);
  editor = await saved((e) => e.annotationRegions.length > 0);
  const rerun = editor.annotationRegions.filter((r) => r.generatedBy === 'transcript');
  check('Running again replaces instead of duplicating', rerun.length === captions.length, `${captions.length} → ${rerun.length}`);

  step('undo');
  const undone = await renderer(win, `(() => { const b = Array.from(document.querySelectorAll('[data-sonner-toast] button')).find(b => b.textContent.trim() === 'Geri al'); if (b) b.click(); return !!b; })()`);
  check('Notice offers undo', undone);
  editor = await saved(() => true);
  const restoredIds = editor.annotationRegions.filter((r) => r.generatedBy === 'transcript').map((r) => r.id).sort().join();
  check('Undo restores the previous captions', restoredIds === captions.map((c) => c.id).sort().join(), restoredIds);
  win.webContents.send('menu-save-project');

  step('cancel');
  // Transcripts are cached per file version; touch the file so this run does real work to cancel.
  const now = new Date();
  await fs.utimes(video, now, now);
  const before = editor.annotationRegions.length;
  await renderer(win, `document.querySelector('[data-testid="auto-captions-generate"]').click()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="auto-captions-cancel"]')`), 10000);
  await renderer(win, `document.querySelector('[data-testid="auto-captions-cancel"]').click()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="auto-captions-generate"]')`), 20000);
  await delay(500);
  const cancelError = await renderer(win, `document.querySelector('[data-testid="auto-captions-error"]')?.textContent || ''`);
  editor = await saved(() => true);
  check('Cancel stops without changes or errors', !cancelError && editor.annotationRegions.length === before, cancelError);
  await fs.writeFile(path.join(artifacts, 'auto-captions.png'), (await win.webContents.capturePage()).toPNG());
})()
  .catch(async (error) => {
    report.errors.push(String(error?.stack || error));
    console.error(error);
    const win = findWindow('editor') || findWindow('welcome');
    if (win) await fs.writeFile(path.join(artifacts, 'auto-captions-failure.png'), (await win.webContents.capturePage()).toPNG()).catch(() => undefined);
  })
  .finally(async () => {
    await fs.writeFile(path.join(artifacts, 'auto-captions-report.json'), JSON.stringify(report, null, 2));
    const failed = report.errors.length > 0 || report.checks.some((entry) => !entry.passed);
    console.log(`AUTO_CAPTIONS ${failed ? 'FAILED' : 'PASSED'}`);
    app.exit(failed ? 1 : 0);
  });
