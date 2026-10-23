// Checks the click-tracking permission flow as if Accessibility were not granted: the
// welcome setup card, its Allow button, and the question before a recording starts
// (Allow / Record without it / Cancel, and "do not ask again"). Native capture is stubbed,
// nothing is recorded. Isolated profile. Run after `npx vite build`.
const { app, BrowserWindow, dialog, ipcMain, systemPreferences } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
app.setPath('userData', path.join(artifacts, 'click-permission-profile'));
app.getAppPath = () => root;

const report = { checks: [], errors: [] };
function check(name, passed, detail) {
  report.checks.push({ name, passed: !!passed, ...(detail === undefined ? {} : { detail }) });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : `: ${detail}`}`);
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(getter, timeout = 20000) {
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
  await fs.rm(path.join(artifacts, 'click-permission-profile'), { recursive: true, force: true });
  // Pretend Accessibility is not granted; record prompts (trusted(true)) and Settings openings.
  const prompts = [];
  systemPreferences.isTrustedAccessibilityClient = (prompt) => { if (prompt) prompts.push('prompt'); return false; };
  const { shell } = require('electron');
  const opened = [];
  shell.openExternal = async (url) => { opened.push(url); };
  let dialogAnswer = { response: 2, checkboxChecked: false };
  const dialogs = [];
  dialog.showMessageBox = async (...args) => { const options = args.find((a) => a && a.buttons); dialogs.push(options); return dialogAnswer; };

  await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href);
  await app.whenReady();
  const welcome = await waitFor(() => findWindow('welcome'));
  // Starting a capture is not part of this test: count the attempts instead (after the app
  // has registered its own handlers).
  let captureStarts = 0;
  ipcMain.removeHandler('start-native-screen-recording');
  ipcMain.handle('start-native-screen-recording', () => { captureStarts += 1; return { success: false, message: 'stubbed' }; });
  const card = await waitFor(() => renderer(welcome, `(() => { const c = document.querySelector('[data-testid="permission-setup"]'); return c ? c.innerText : null; })()`));
  check('Welcome shows the permission setup', /Tıklama takibi/.test(card), card.split('\n').slice(0, 2).join(' / '));
  await fs.writeFile(path.join(artifacts, 'click-permission-welcome.png'), (await welcome.webContents.capturePage()).toPNG());
  check('Click tracking is shown as not allowed', await renderer(welcome, `document.querySelector('[data-testid="permission-clicks"]').dataset.granted === 'false'`));
  await renderer(welcome, `document.querySelector('[data-testid="permission-clicks"] button').click()`);
  await waitFor(() => opened.some((url) => url.includes('Accessibility')));
  check('Allow asks macOS and opens Accessibility settings', prompts.length > 0, opened.join(', '));

  await renderer(welcome, 'void window.electronAPI.showRecorder()');
  const hud = await waitFor(() => findWindow('hud-overlay'));
  await waitFor(() => renderer(hud, `!!Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Kaydet'))`));
  check('Recorder shows that click zoom is off', await waitFor(() => renderer(hud, `!!document.querySelector('[data-testid="click-tracking-permission"]')`)));
  await renderer(hud, `window.alert = () => {}; window.electronAPI.selectSource({ id: 'screen:0:0', name: 'Test screen' })`);
  const recordButton = `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Kaydet'))`;
  await waitFor(() => renderer(hud, `!${recordButton}.disabled`));
  const press = async () => {
    const before = dialogs.length;
    await renderer(hud, `${recordButton}.click()`);
    await waitFor(() => dialogs.length > before, 10000);
    await delay(1200);
  };

  dialogAnswer = { response: 2, checkboxChecked: false };
  await press();
  check('Recording asks first when click tracking is off', /Tıklama takibi kapalı/.test(dialogs.at(-1).message), dialogs.at(-1).buttons.join(' / '));
  check('Cancel does not start a recording', captureStarts === 0);

  const promptsBefore = prompts.length;
  dialogAnswer = { response: 0, checkboxChecked: false };
  await press();
  check('Allow opens the settings and does not record', captureStarts === 0 && prompts.length > promptsBefore);

  dialogAnswer = { response: 1, checkboxChecked: true };
  await press();
  await waitFor(() => captureStarts > 0, 10000);
  check('Record without it starts the recording', captureStarts === 1);
  const asked = dialogs.length;
  await renderer(hud, `${recordButton}.click()`);
  await waitFor(() => captureStarts > 1, 10000);
  check('"Do not ask again" is remembered', dialogs.length === asked);
})()
  .catch((error) => {
    report.errors.push(String(error?.stack || error));
    console.error(error);
  })
  .finally(async () => {
    await fs.writeFile(path.join(artifacts, 'click-permission-report.json'), JSON.stringify(report, null, 2));
    const failed = report.errors.length > 0 || report.checks.some((entry) => !entry.passed);
    console.log(`CLICK_PERMISSION ${failed ? 'FAILED' : 'PASSED'}`);
    app.exit(failed ? 1 : 0);
  });
