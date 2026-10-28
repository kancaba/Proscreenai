// Caption looks: picking a ready-made look restyles every speech caption (not other texts),
// the brand look follows the picked colour, undo brings the old look back, and the preview and
// the exported video show the same look. Saves the preview and an exported frame as PNGs to
// compare. Isolated profile; run after `npx vite build`.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const profile = path.join(artifacts, 'caption-styles-profile');
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

const caption = (id, text, startMs, endMs, generatedBy) => ({
  id, startMs, endMs, type: 'text', content: text, textContent: text,
  position: { x: 10, y: 74 }, size: { width: 80, height: 20 },
  style: { color: '#ffffff', backgroundColor: '#000000b3', fontSize: 28, fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none', textAlign: 'center' },
  zIndex: 1, ...(generatedBy ? { generatedBy } : {}),
});

(async () => {
  await fs.rm(profile, { recursive: true, force: true });
  const video = path.join(artifacts, 'caption-styles-sample.mp4');
  await fs.copyFile(path.join(artifacts, 'sample.mp4'), video);
  const projectPath = path.join(artifacts, 'caption-styles.screenmovie');
  const title = { ...caption('annotation-9', 'Başlık', 0, 6000), position: { x: 10, y: 5 }, style: { ...caption('x', '', 0, 1).style, fontSize: 40, backgroundColor: 'transparent', fontWeight: 'bold' } };
  await fs.writeFile(projectPath, JSON.stringify({
    version: 1,
    videoPath: video,
    editor: { annotationRegions: [caption('annotation-1', 'Merhaba dünya, bu bir altyazı', 300, 3000, 'transcript'), caption('annotation-2', '==Önemli== kelime burada', 3000, 5800, 'transcript'), title] },
  }));

  await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href);
  await app.whenReady();
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [projectPath] });
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: projectPath });
  const welcome = await waitFor(() => findWindow('welcome'));
  await waitFor(() => renderer(welcome, `document.body.innerText.includes('Proje')`));
  await renderer(welcome, `Array.from(document.querySelectorAll('button')).find(b => /Proje aç/.test(b.textContent)).click()`);
  const win = await waitFor(() => findWindow('editor'));
  await waitFor(() => renderer(win, `!!document.querySelector('video') && document.querySelector('video').readyState >= 2`));
  await delay(1500);

  async function saved() {
    await fs.rm(projectPath, { force: true });
    win.webContents.send('menu-save-project');
    return waitFor(async () => JSON.parse(await fs.readFile(projectPath, 'utf8').catch(() => 'null'))?.editor);
  }
  const styles = (editor) => editor.annotationRegions.map((region) => region.style);
  const checked = () => renderer(win, `document.querySelector('[data-testid^="caption-style-"][aria-checked="true"]')?.dataset.testid ?? ''`);
  const seek = async (seconds) => {
    await renderer(win, `document.querySelector('video').currentTime = ${seconds}`);
    await delay(800);
  };

  // Open the AI tab (Radix tabs switch on mouse down).
  await renderer(win, `Array.from(document.querySelectorAll('[role="tab"]')).find(t => t.textContent.trim() === 'AI').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="caption-styles"]')`));
  check('Captions with the old default show as Klasik', (await checked()) === 'caption-style-classic', await checked());

  await renderer(win, `document.querySelector('[data-testid="caption-style-cinema"]').click()`);
  let editor = await saved();
  check('Sinema restyles both speech captions', styles(editor).slice(0, 2).every((s) => s.backgroundColor === 'transparent' && s.strokeWidth === 3 && s.textShadow === 'strong' && s.fontSize === 28), JSON.stringify(styles(editor)[0]));
  check('Other texts keep their look', styles(editor)[2].fontSize === 40 && !styles(editor)[2].strokeWidth);
  check('The picker shows Sinema', (await checked()) === 'caption-style-cinema');
  await seek(1);
  await fs.writeFile(path.join(artifacts, 'caption-style-cinema.png'), (await win.webContents.capturePage()).toPNG());

  await renderer(win, `document.querySelector('[data-testid="caption-style-brand"]').click()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="caption-brand-color"]')`));
  await renderer(win, `(() => { const input = document.querySelector('[data-testid="caption-brand-color"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '#fde68a'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  editor = await saved();
  check('Marka rengi uses the picked colour with readable text', styles(editor)[0].backgroundColor === '#fde68a' && styles(editor)[0].color === '#111111', JSON.stringify(styles(editor)[0]));

  win.focus();
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'z', modifiers: ['meta'] });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'z', modifiers: ['meta'] });
  await waitFor(async () => (await checked()) === 'caption-style-cinema', 5000).catch(() => null);
  check('Undo brings the previous look back', (await checked()) === 'caption-style-cinema', await checked());

  await renderer(win, `document.querySelector('[data-testid="caption-style-highlight"]').click()`);
  editor = await saved();
  check('Vurgulu sets outline and highlight colour', styles(editor)[1].strokeWidth === 4 && styles(editor)[1].highlightColor === '#facc15');
  await seek(4);
  await fs.writeFile(path.join(artifacts, 'caption-style-highlight-preview.png'), (await win.webContents.capturePage()).toPNG());

  // Export and take the frame at 4 s to compare with the preview.
  const exportStarted = Date.now();
  await renderer(win, `Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('dışa aktar')).click()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="confirm-export"]')`));
  await renderer(win, `document.querySelector('[data-testid="confirm-export"]').click()`);
  const recordings = path.join(profile, 'recordings');
  const exported = await waitFor(async () => {
    for (const name of (await fs.readdir(recordings).catch(() => [])).filter((n) => n.endsWith('.mp4'))) {
      const stat = await fs.stat(path.join(recordings, name));
      if (stat.mtimeMs >= exportStarted - 1000 && stat.size > 1000) return path.join(recordings, name);
    }
    return null;
  }, 180000);
  await delay(2500);
  const frame = path.join(artifacts, 'caption-style-highlight-export.png');
  const grabbed = spawnSync(ffmpeg, ['-y', '-ss', '4', '-i', exported, '-frames:v', '1', frame]);
  check('A frame of the export was saved to compare', grabbed.status === 0);
})()
  .catch(async (error) => {
    report.errors.push(String(error?.stack || error));
    console.error(error);
    const win = findWindow('editor');
    if (win) await fs.writeFile(path.join(artifacts, 'caption-styles-failure.png'), (await win.webContents.capturePage()).toPNG()).catch(() => undefined);
  })
  .finally(async () => {
    const failed = report.errors.length > 0 || report.checks.some((entry) => !entry.passed);
    console.log(`CAPTION_STYLES ${failed ? 'FAILED' : 'PASSED'}`);
    app.exit(failed ? 1 : 0);
  });
