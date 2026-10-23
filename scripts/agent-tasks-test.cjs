// Runs every ready-made agent task once with a real tool (default Codex) on the speech
// sample and reports what each one proposed. Does not apply anything. Run after
// `npx vite build` and auto-captions-test (for the sample video).
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const work = path.join(artifacts, 'agent');
const TOOL = process.env.AGENT_TOOL || 'codex';
const TASKS = ['smart-zoom', 'fix-captions', 'cut-pauses', 'speed-up-waits', 'chapters', 'short-version'];
// What each task is expected to propose.
// The sample's pauses are under 1.2 s and it has no long waits, so cut-pauses and
// speed-up-waits rightly propose nothing; they must still finish without an error.
const EXPECTED = { 'smart-zoom': 'zoom', 'fix-captions': 'caption', 'cut-pauses': null, 'speed-up-waits': null, chapters: 'text', 'short-version': 'trim' };
app.setPath('userData', path.join(artifacts, 'agent-tasks-profile'));
app.getAppPath = () => root;

const report = { tool: TOOL, checks: [], tasks: {}, errors: [] };
function check(name, passed, detail) {
  report.checks.push({ name, passed: !!passed, ...(detail === undefined ? {} : { detail }) });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : `: ${detail}`}`);
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(getter, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await getter();
    if (value) return value;
    await delay(250);
  }
  throw new Error('Timed out waiting for application state');
}
const renderer = (win, code) => win.webContents.executeJavaScript(code, true);
const findWindow = (part) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes(part));

(async () => {
  await fs.rm(path.join(artifacts, 'agent-tasks-profile'), { recursive: true, force: true });
  const video = path.join(work, 'agent-sample.mp4');
  await fs.access(video);
  await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href);
  await app.whenReady();
  const welcome = await waitFor(() => findWindow('welcome'));
  await waitFor(() => renderer(welcome, `document.body.innerText.includes('Video içe aktar')`));
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [video] });
  await renderer(welcome, `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Video içe aktar')).click()`);
  const win = await waitFor(() => findWindow('editor'));
  await waitFor(() => renderer(win, `!!document.querySelector('video') && document.querySelector('video').readyState >= 2`));
  await delay(1500);
  await renderer(win, `Array.from(document.querySelectorAll('[role="tab"]')).find(t => t.textContent.trim() === 'AI').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))`);
  await waitFor(() => renderer(win, `(() => { const s = document.querySelector('[data-testid="agent-tool"]'); return s && s.options.length >= 4; })()`), 60000);
  await renderer(win, `(() => { const s = document.querySelector('[data-testid="agent-tool"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, ${JSON.stringify(TOOL)}); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);

  for (const task of TASKS) {
    const started = Date.now();
    await waitFor(() => renderer(win, `!document.querySelector('[data-testid="agent-task-${task}"]')?.disabled`), 10000);
    await renderer(win, `document.querySelector('[data-testid="agent-task-${task}"]').click()`);
    await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="agent-stop"]')`), 15000);
    await waitFor(() => renderer(win, `!document.querySelector('[data-testid="agent-stop"]')`), 8 * 60 * 1000);
    const error = await renderer(win, `document.querySelector('[data-testid="agent-error"]')?.innerText || ''`);
    const items = await renderer(win, `Array.from(document.querySelectorAll('[data-testid="agent-proposal"]')).map(p => p.dataset.kind + ': ' + p.innerText.replace(/\\s+/g, ' '))`);
    const log = await renderer(win, `document.querySelector('[data-testid="agent-log"]')?.innerText || ''`);
    report.tasks[task] = { seconds: Math.round((Date.now() - started) / 1000), error, items, log };
    const expected = EXPECTED[task];
    const ok = !error && (expected ? items.some((item) => item.startsWith(`${expected}:`)) : true);
    check(`${task}`, ok, `${report.tasks[task].seconds} s, ${items.length} proposals${error ? `, error: ${error}` : ''}${items.length ? ` — ${items.slice(0, 3).join(' | ')}` : ''}`);
    await renderer(win, `document.querySelector('[data-testid="agent-reject"]')?.click()`);
  }
})()
  .catch((error) => {
    report.errors.push(String(error?.stack || error));
    console.error(error);
  })
  .finally(async () => {
    await fs.writeFile(path.join(artifacts, 'agent-tasks-report.json'), JSON.stringify(report, null, 2));
    const failed = report.errors.length > 0 || report.checks.some((entry) => !entry.passed);
    console.log(`AGENT_TASKS ${failed ? 'FAILED' : 'PASSED'}`);
    app.exit(failed ? 1 : 0);
  });
