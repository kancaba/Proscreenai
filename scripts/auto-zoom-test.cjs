// Exercises automatic click zoom in the editor: notice after opening a recording with
// clicks, removing the zooms from the notice, settings (density, rebuild, persistence),
// and the offer for a saved project without zooms.
// Isolated profile; needs artifacts/sample.mp4. Run after `npx vite build`.
const { app, BrowserWindow, dialog, systemPreferences } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
app.setPath('userData', path.join(artifacts, 'auto-zoom-profile'));
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
const toastText = `Array.from(document.querySelectorAll('[data-sonner-toast]')).map(t => t.innerText).join(' | ')`;
const clickToastButton = (label) => `(() => { const b = Array.from(document.querySelectorAll('[data-sonner-toast] button')).find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (b) b.click(); return !!b; })()`;

(async () => {
  await fs.rm(path.join(artifacts, 'auto-zoom-profile'), { recursive: true, force: true });
  const sample = path.join(artifacts, 'sample.mp4');
  const clicked = path.join(artifacts, 'auto-zoom-clicks.mp4');
  const bare = path.join(artifacts, 'auto-zoom-bare.mp4');
  await fs.copyFile(sample, clicked);
  await fs.copyFile(sample, bare);
  await fs.rm(`${bare}.cursor.json`, { force: true });
  // Clicks at 1.0 s and 3.6 s in the same spot (merged at low density, split at high),
  // and one at 5.0 s on the other side of the screen.
  const clickAt = new Map([[30, [0.3, 0.3]], [108, [0.3, 0.3]], [150, [0.8, 0.7]]]);
  const samples = Array.from({ length: 181 }, (_, index) => {
    const point = clickAt.get(index);
    return { timeMs: Math.round(index * (1000 / 30)), cx: point ? point[0] : 0.5, cy: point ? point[1] : 0.5, cursorType: 'arrow', interactionType: point ? 'click' : 'move' };
  });
  await fs.writeFile(`${clicked}.cursor.json`, JSON.stringify({ version: 2, samples }));

  await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href);
  await app.whenReady();
  step('welcome');
  const welcome = await waitFor(() => findWindow('welcome'));
  await waitFor(() => renderer(welcome, `document.body.innerText.includes('Video içe aktar')`));
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [clicked] });
  await renderer(welcome, `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Video içe aktar')).click()`);
  step('editor');
  const win = await waitFor(() => findWindow('editor'));
  await waitFor(() => renderer(win, `!!document.querySelector('video') && document.querySelector('video').readyState >= 2`));

  const project = path.join(artifacts, 'auto-zoom.screenmovie');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: project });
  async function saved(predicate) {
    win.webContents.send('menu-save-project');
    return waitFor(async () => {
      const data = JSON.parse(await fs.readFile(project, 'utf8').catch(() => '{}'));
      return data.editor && predicate(data.editor) ? data.editor : null;
    });
  }

  step('notice');
  const notice = await waitFor(async () => { const text = await renderer(win, toastText); return /3 tıklama bulundu, \d+ zoom eklendi/.test(text) ? text : null; });
  check('Notice reports clicks and added zooms', true, notice);
  check('Generated zooms add no undo step', await renderer(win, `document.querySelector('button[aria-label="Geri al"]').disabled`));
  let editor = await saved((e) => e.zoomRegions.length > 0);
  const generated = editor.zoomRegions.length;
  check('Zooms start before the first click', Math.min(...editor.zoomRegions.map((z) => z.startMs)) < 1000, JSON.stringify(editor.zoomRegions.map((z) => [z.startMs, z.endMs])));

  step('remove');
  check('Notice has a Remove button', await renderer(win, clickToastButton('Kaldır')));
  editor = await saved((e) => e.zoomRegions.length === 0);
  check('Remove takes the generated zooms out', true);
  check('Removing can be undone', !(await renderer(win, `document.querySelector('button[aria-label="Geri al"]').disabled`)));

  step('settings');
  // Radix tabs switch on mousedown, not click.
  await renderer(win, `Array.from(document.querySelectorAll('[role="tab"]')).find(t => t.textContent.includes('Hareket')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="auto-zoom-settings"]') && document.querySelector('[data-testid="auto-zoom-settings"]').offsetParent !== null`));
  const pick = (group, value) => renderer(win, `document.querySelector('[data-testid="${group}"] [data-value="${value}"]').click()`);
  await pick('auto-zoom-density', 'low');
  await renderer(win, `document.querySelector('[data-testid="auto-zoom-regenerate"]').click()`);
  const low = await saved((e) => e.zoomRegions.length > 0);
  await pick('auto-zoom-density', 'high');
  await pick('auto-zoom-depth', '5');
  await renderer(win, `document.querySelector('[data-testid="auto-zoom-regenerate"]').click()`);
  const high = await saved((e) => e.zoomRegions.length > low.zoomRegions.length);
  check('Higher density makes more zooms', high.zoomRegions.length > low.zoomRegions.length, `${low.zoomRegions.length} → ${high.zoomRegions.length}`);
  check('Rebuilt zooms use the chosen depth', high.zoomRegions.every((z) => z.depth === 5));
  const stored = await renderer(win, `localStorage.getItem('screenmovie.autoZoom')`);
  check('Settings are remembered', JSON.parse(stored).density === 'high' && JSON.parse(stored).depth === 5, stored);
  await pick('auto-zoom-mode', 'off');
  check('Off disables the other options', await renderer(win, `getComputedStyle(document.querySelector('[data-testid="auto-zoom-regenerate"]').parentElement).pointerEvents === 'none'`));
  await pick('auto-zoom-mode', 'clicks');
  await pick('auto-zoom-density', 'normal');
  await pick('auto-zoom-depth', '3');

  step('offer');
  // Save the project without zooms, then open it again: zooms are offered, not forced.
  await renderer(win, `document.querySelector('[data-testid="auto-zoom-regenerate"]').click()`);
  await saved((e) => e.zoomRegions.length === generated);
  check('Rebuild with defaults matches the first result', true);
  const emptyProject = JSON.parse(await fs.readFile(project, 'utf8'));
  emptyProject.editor.zoomRegions = [];
  await fs.writeFile(project, JSON.stringify(emptyProject));
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project] });
  dialog.showMessageBox = async () => ({ response: 1 });
  dialog.showMessageBoxSync = () => 1;
  win.webContents.send('menu-load-project');
  const offer = await waitFor(async () => { const text = await renderer(win, toastText); return text.includes('Bu projede zoom yok') ? text : null; }).catch(async (error) => {
    console.log('DEBUG toasts:', await renderer(win, toastText), 'duration:', await renderer(win, `document.querySelector('video')?.duration`));
    throw error;
  });
  check('Opening a project without zooms offers them', true, offer);
  // Zoom items on the timeline show their scale (1.8× at the default depth).
  const timelineZooms = () => renderer(win, `Array.from(document.querySelectorAll('[data-timeline-body] .group')).filter(el => el.textContent.includes('1.8') && el.getBoundingClientRect().height < 60).length`);
  await delay(1000);
  check('Offered zooms are not added on their own', (await timelineZooms()) === 0, String(await timelineZooms()));
  await renderer(win, clickToastButton('Ekle'));
  editor = await saved((e) => e.zoomRegions.length > 0);
  check('Accepting the offer adds the zooms', editor.zoomRegions.length === generated, String(editor.zoomRegions.length));

  report.accessibilityTrusted = systemPreferences.isTrustedAccessibilityClient(false);
  await fs.writeFile(path.join(artifacts, 'auto-zoom.png'), (await win.webContents.capturePage()).toPNG());
})()
  .catch(async (error) => {
    report.errors.push(String(error?.stack || error));
    console.error(error);
    const win = findWindow('editor') || findWindow('welcome');
    if (win) await fs.writeFile(path.join(artifacts, 'auto-zoom-failure.png'), (await win.webContents.capturePage()).toPNG()).catch(() => undefined);
  })
  .finally(async () => {
    await fs.writeFile(path.join(artifacts, 'auto-zoom-report.json'), JSON.stringify(report, null, 2));
    const failed = report.errors.length > 0 || report.checks.some((entry) => !entry.passed);
    console.log(`AUTO_ZOOM ${failed ? 'FAILED' : 'PASSED'}`);
    app.exit(failed ? 1 : 0);
  });
