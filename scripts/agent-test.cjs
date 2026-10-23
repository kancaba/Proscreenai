// End-to-end check of the AI agent panel with a real, signed-in tool (default Codex;
// AGENT_TOOL=claude|cursor|opencode to pick another). Uses the speech video from
// auto-captions-test (run that first) plus synthetic clicks. Runs real AI requests on the
// user's own account. Isolated profile. Run after `npx vite build`.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const work = path.join(artifacts, 'agent');
const TOOL = process.env.AGENT_TOOL || 'codex';
// Slow free models (OpenCode) need longer: AGENT_TIMEOUT_MIN=20.
const RUN_TIMEOUT = Number(process.env.AGENT_TIMEOUT_MIN || 6) * 60 * 1000;
app.setPath('userData', path.join(artifacts, 'agent-profile'));
// Electron treats the script folder as the app folder; point it at the repo for assets.
app.getAppPath = () => root;

const report = { tool: TOOL, checks: [], errors: [] };
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
    await delay(250);
  }
  throw new Error(`Timed out waiting for application state (${currentStep})`);
}
const renderer = (win, code) => win.webContents.executeJavaScript(code, true);
const findWindow = (part) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes(part));

(async () => {
  await fs.rm(path.join(artifacts, 'agent-profile'), { recursive: true, force: true });
  await fs.mkdir(work, { recursive: true });
  const source = path.join(artifacts, 'auto-captions', 'speech-sample.mp4');
  const video = path.join(work, 'agent-sample.mp4');
  await fs.copyFile(source, video);
  // Clicks during sentences 2 and 4 ("kayıt düğmesine tıklıyorum", "editör açılıyor").
  const clicks = new Map([[180, [0.82, 0.12]], [186, [0.83, 0.12]], [450, [0.4, 0.55]]]);
  const samples = Array.from({ length: 690 }, (_, i) => {
    const click = clicks.get(i);
    return { timeMs: Math.round(i * (1000 / 30)), cx: click ? click[0] : 0.5, cy: click ? click[1] : 0.5, cursorType: 'arrow', interactionType: click ? 'click' : 'move' };
  });
  await fs.writeFile(`${video}.cursor.json`, JSON.stringify({ version: 2, samples }));

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
  await delay(1500);
  // Radix tabs switch on mousedown, not click.
  await renderer(win, `Array.from(document.querySelectorAll('[role="tab"]')).find(t => t.textContent.trim() === 'AI').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="agent-panel"]')`));

  const project = path.join(work, 'agent.screenmovie');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: project });
  async function saved(predicate) {
    await fs.rm(project, { force: true });
    win.webContents.send('menu-save-project');
    return waitFor(async () => {
      const data = JSON.parse(await fs.readFile(project, 'utf8').catch(() => '{}'));
      return data.editor && predicate(data.editor) ? data.editor : null;
    });
  }
  const selectTool = (id) => renderer(win, `(() => { const s = document.querySelector('[data-testid="agent-tool"]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, ${JSON.stringify(id)}); s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; })()`);

  step('detect');
  const options = await waitFor(() => renderer(win, `(() => { const o = Array.from(document.querySelectorAll('[data-testid="agent-tool"] option')).map(o => o.textContent); return o.length >= 4 && !o[0].includes('aranıyor') ? o : null; })()`), 60000);
  report.detected = options;
  check('Tools are detected with their status', options.length === 4, options.join(' | '));

  const claude = options.find((o) => o.startsWith('Claude'));
  if (claude && claude.includes('giriş gerekli')) {
    await selectTool('claude');
    await delay(300);
    const hint = await renderer(win, `document.querySelector('[data-testid="agent-sign-in"]')?.innerText || ''`);
    check('A signed-out tool shows how to sign in and cannot run', hint.includes('claude') && (await renderer(win, `document.querySelector('[data-testid="agent-task-smart-zoom"]').disabled`)), hint.replace(/\s+/g, ' '));
  }

  step('task');
  check(`Select ${TOOL}`, (await selectTool(TOOL)) === TOOL);
  await waitFor(() => renderer(win, `!document.querySelector('[data-testid="agent-task-smart-zoom"]').disabled`), 5000);
  const zoomsBefore = (await saved(() => true)).zoomRegions;
  const started = Date.now();
  await renderer(win, `document.querySelector('[data-testid="agent-task-smart-zoom"]').click()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="agent-stop"]')`), 15000);
  check('Run shows progress and a stop button', true);
  await waitFor(() => renderer(win, `!document.querySelector('[data-testid="agent-stop"]')`), RUN_TIMEOUT);
  const log = await renderer(win, `document.querySelector('[data-testid="agent-log"]')?.innerText || ''`);
  report.log = log;
  const error = await renderer(win, `document.querySelector('[data-testid="agent-error"]')?.innerText || ''`);
  check('Task finishes without an error', !error, error || `${Math.round((Date.now() - started) / 1000)} s`);
  check('Agent read the clicks through ScreenMovie tools', /Tıklamalar okunuyor/.test(log), log.split('\n').slice(0, 6).join(' / '));
  const proposals = await renderer(win, `Array.from(document.querySelectorAll('[data-testid="agent-proposal"]')).map(p => p.innerText.replace(/\\s+/g, ' '))`);
  report.proposals = proposals;
  check('Agent proposed zooms', proposals.length > 0, proposals.slice(0, 4).join(' | '));
  const usage = await renderer(win, `document.querySelector('[data-testid="agent-usage"]')?.innerText || ''`);
  check('Token use is shown', /giriş/.test(usage) && /çıkış/.test(usage), usage.replace(/\s+/g, ' '));
  await renderer(win, `document.querySelector('[data-testid="agent-expand"]').click()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="agent-panel-wide"]')`), 5000);
  check('Large view shows the proposals', await renderer(win, `document.querySelector('[data-testid="agent-wide-dialog"]').querySelectorAll('[data-testid="agent-proposal"]').length > 0`));
  await renderer(win, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await waitFor(() => renderer(win, `!document.querySelector('[data-testid="agent-wide-dialog"]')`), 5000);
  const unchanged = await saved(() => true);
  check('Nothing changes before approval', JSON.stringify(unchanged.zoomRegions) === JSON.stringify(zoomsBefore));

  step('follow-up');
  // Follow-up while the zoom proposals are still waiting for review: they are kept.
  const canFollow = await renderer(win, `!!document.querySelector('[data-testid="agent-follow-up"]')`);
  check('A follow-up can continue the conversation', canFollow);
  await renderer(win, `(() => { const t = document.querySelector('[data-testid="agent-follow-up"]'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, 'Also add a short chapter title (style title) at the very start of the video, 2500 ms long. Keep your zoom proposals.'); t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await delay(200);
  await renderer(win, `document.querySelector('[data-testid="agent-follow-up-send"]').click()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="agent-stop"]')`), 15000);
  await waitFor(() => renderer(win, `!document.querySelector('[data-testid="agent-stop"]')`), RUN_TIMEOUT);
  const followError = await renderer(win, `document.querySelector('[data-testid="agent-error"]')?.innerText || ''`);
  const kinds = await renderer(win, `Array.from(document.querySelectorAll('[data-testid="agent-proposal"]')).map(p => p.dataset.kind + ': ' + p.innerText.replace(/\\s+/g, ' '))`);
  check('Follow-up adds a title and keeps the zoom proposals', !followError && kinds.some((k) => k.startsWith('text:')) && kinds.some((k) => k.startsWith('zoom:')), followError || kinds.join(' | '));

  step('apply');
  await renderer(win, `document.querySelector('[data-testid="agent-apply"]').click()`);
  const applied = await saved((e) => JSON.stringify(e.zoomRegions) !== JSON.stringify(zoomsBefore));
  report.appliedZooms = applied.zoomRegions;
  const clickTimes = [6000, 6200, 15000];
  check('Applied zooms cover the clicks', clickTimes.every((t) => applied.zoomRegions.some((z) => z.startMs <= t && z.endMs >= t)), JSON.stringify(applied.zoomRegions.map((z) => [z.startMs, z.endMs, z.depth])));
  check('Applied title is on the timeline', applied.annotationRegions.some((a) => a.startMs < 1000 && a.style?.fontSize === 56), JSON.stringify(applied.annotationRegions.map((a) => a.textContent)));
  const undone = await renderer(win, `(() => { const b = Array.from(document.querySelectorAll('[data-sonner-toast] button')).find(b => b.textContent.trim() === 'Geri al'); if (b) b.click(); return !!b; })()`);
  const afterUndo = await saved(() => true);
  check('One undo removes everything that was applied', undone && JSON.stringify(afterUndo.zoomRegions) === JSON.stringify(zoomsBefore) && afterUndo.annotationRegions.length === 0);

  step('cancel');
  await renderer(win, `document.querySelector('[data-testid="agent-task-chapters"]').click()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="agent-stop"]')`), 15000);
  await delay(2500);
  const stopAt = Date.now();
  await renderer(win, `document.querySelector('[data-testid="agent-stop"]').click()`);
  await waitFor(() => renderer(win, `!document.querySelector('[data-testid="agent-stop"]')`), 30000);
  const cancelError = await renderer(win, `document.querySelector('[data-testid="agent-error"]')?.innerText || ''`);
  check('Stop ends the run quickly without an error', !cancelError && Date.now() - stopAt < 10000, `${Date.now() - stopAt} ms ${cancelError}`);
  await fs.writeFile(path.join(artifacts, 'agent.png'), (await win.webContents.capturePage()).toPNG());
})()
  .catch(async (error) => {
    report.errors.push(String(error?.stack || error));
    console.error(error);
    const win = findWindow('editor') || findWindow('welcome');
    if (win) await fs.writeFile(path.join(artifacts, 'agent-failure.png'), (await win.webContents.capturePage()).toPNG()).catch(() => undefined);
  })
  .finally(async () => {
    await fs.writeFile(path.join(artifacts, 'agent-report.json'), JSON.stringify(report, null, 2));
    const failed = report.errors.length > 0 || report.checks.some((entry) => !entry.passed);
    console.log(`AGENT ${failed ? 'FAILED' : 'PASSED'}`);
    app.exit(failed ? 1 : 0);
  });
