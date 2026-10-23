// Drives the on-screen area selector with real input events in an isolated profile.
// Run after `npx vite build`: npx electron scripts/region-selector-test.cjs
// The overlay covers the real screen: keep the mouse still while it runs, or real
// pointer moves mix with the synthetic drag.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
app.setPath('userData', path.join(artifacts, 'region-selector-profile'));
// Electron treats the script folder as the app folder; point it at the repo for assets.
app.getAppPath = () => root;

const report = { checks: [], errors: [] };
function check(name, passed, detail) {
  report.checks.push({ name, passed: !!passed, ...(detail === undefined ? {} : { detail }) });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : `: ${detail}`}`);
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(getter, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await getter();
    if (value) return value;
    await delay(100);
  }
  throw new Error('Timed out waiting for application state');
}
const renderer = (win, code) => win.webContents.executeJavaScript(code, true);
const findWindow = (part) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes(part));

async function openSelector(from) {
  await renderer(from, 'window.electronAPI.openRegionSelector()');
  const overlay = await waitFor(() => findWindow('region-selector'));
  await waitFor(() => overlay.isVisible() && renderer(overlay, `!!document.querySelector('[role="toolbar"]')`));
  return overlay;
}
function mouse(win, type, x, y) {
  win.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 });
}
async function drag(win, from, to) {
  mouse(win, 'mouseDown', from.x, from.y);
  for (let step = 1; step <= 6; step += 1) {
    mouse(win, 'mouseMove', from.x + ((to.x - from.x) * step) / 6, from.y + ((to.y - from.y) * step) / 6);
    await delay(16);
  }
  mouse(win, 'mouseUp', to.x, to.y);
  await delay(120);
}
const sizeLabel = (win) => renderer(win, `document.querySelector('[data-testid="region-size"]')?.textContent ?? ''`);

(async () => {
  await fs.mkdir(artifacts, { recursive: true });
  await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href);
  await app.whenReady();
  const welcome = await waitFor(() => findWindow('welcome'));
  await waitFor(() => renderer(welcome, 'document.readyState === "complete"'));

  // Escape leaves the selected source untouched.
  let overlay = await openSelector(welcome);
  const { bounds, scale } = await renderer(overlay, `({ bounds: { width: innerWidth, height: innerHeight }, scale: devicePixelRatio })`);
  check('Overlay covers the display', bounds.width > 600 && bounds.height > 400, JSON.stringify(bounds));
  overlay.focus();
  overlay.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  await waitFor(() => overlay.isDestroyed());
  check('Escape cancels without selecting', (await renderer(welcome, 'window.electronAPI.getSelectedSource()')) === null);

  overlay = await openSelector(welcome);
  // Let the pointer-enter from the window appearing under the real cursor pass first.
  await delay(600);
  await drag(overlay, { x: 200, y: 150 }, { x: 800, y: 500 });
  const freeLabel = await sizeLabel(overlay);
  const expected = `${Math.floor((600 * scale) / 2) * 2} × ${Math.floor((350 * scale) / 2) * 2} px`;
  check('Dragging draws the area with its pixel size', freeLabel === expected, freeLabel);

  await renderer(overlay, `Array.from(document.querySelectorAll('[role="toolbar"] button')).find(b => b.textContent === '16:9').click()`);
  await delay(100);
  const ratioRect = await renderer(overlay, `(() => { const r = document.querySelector('[role="region"]').getBoundingClientRect(); return { w: r.width, h: r.height }; })()`);
  check('Aspect lock reshapes the area', Math.abs(ratioRect.w / ratioRect.h - 16 / 9) < 0.01, JSON.stringify(ratioRect));

  // Resize from the right edge keeps the ratio.
  const handle = await renderer(overlay, `(() => { const r = document.querySelector('[data-handle="e"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await drag(overlay, handle, { x: handle.x + 120, y: handle.y });
  const resized = await renderer(overlay, `(() => { const r = document.querySelector('[role="region"]').getBoundingClientRect(); return { w: r.width, h: r.height }; })()`);
  check('Edge handle resizes with the ratio kept', resized.w > ratioRect.w + 100 && Math.abs(resized.w / resized.h - 16 / 9) < 0.01, JSON.stringify(resized));

  await fs.writeFile(path.join(artifacts, 'region-selector.png'), (await overlay.webContents.capturePage()).toPNG());
  overlay.focus();
  overlay.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  await waitFor(() => overlay.isDestroyed());
  const selected = await renderer(welcome, 'window.electronAPI.getSelectedSource()');
  const region = selected?.captureRegion;
  check('Enter selects the screen with the area', !!region && selected.id.startsWith('screen:') && selected.name.endsWith('· Alan'), JSON.stringify(region));
  check('Selected area matches what was drawn', !!region && Math.abs(region.width * bounds.width - resized.w) < 1 && Math.abs(region.height * bounds.height - resized.h) < 1);

  // Reopening shows the previous area for adjustment.
  overlay = await openSelector(welcome);
  check('Reopening restores the previous area', (await sizeLabel(overlay)).length > 0, await sizeLabel(overlay));
  overlay.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  await waitFor(() => overlay.isDestroyed());
})()
  .catch((error) => {
    report.errors.push(String(error?.stack || error));
    console.error(error);
  })
  .finally(async () => {
    await fs.writeFile(path.join(artifacts, 'region-selector-report.json'), JSON.stringify(report, null, 2));
    const failed = report.errors.length > 0 || report.checks.some((entry) => !entry.passed);
    console.log(`REGION_SELECTOR ${failed ? 'FAILED' : 'PASSED'}`);
    app.exit(failed ? 1 : 0);
  });
