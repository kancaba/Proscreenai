// Runs the production renderer in an isolated Electron profile. Dialogs are
// stubbed only inside this test process; no user files or OS grants are changed.
const { app, BrowserWindow, dialog, systemPreferences, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
app.setPath('userData', path.join(artifacts, process.env.SCREENMOVIE_TEST_PROFILE_SUFFIX ? `smoke-profile-${process.env.SCREENMOVIE_TEST_PROFILE_SUFFIX.replace(/[^a-z0-9-]/gi, '')}` : 'smoke-profile'));
app.setName('ScreenMovie Smoke');
app.getAppPath = () => root;
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const report = { checks: [], errors: [] };
const check = (name, condition, detail) => {
  report.checks.push({ name, passed: !!condition, detail });
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}${detail ? ': '+detail : ''}`);
  if (!condition) throw new Error(name);
};
async function waitFor(getter, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await getter(); if (value) return value; await delay(150); }
  throw new Error('Timed out waiting for application state');
}
async function renderer(win, code) { return win.webContents.executeJavaScript(code, true); }
async function screenshot(win, name) { await fs.writeFile(path.join(artifacts, name), (await win.webContents.capturePage()).toPNG()); }

/** Exports are saved straight into the recordings folder; wait for the newest finished file there. */
async function waitForExportFile(ext, sinceMs, timeout = 180000) {
  const dir = path.join(app.getPath('userData'), 'recordings');
  const end = Date.now() + timeout;
  let last = null;
  while (Date.now() < end) {
    const names = await fs.readdir(dir).catch(() => []);
    const stats = await Promise.all(names.filter((name) => name.endsWith(ext)).map(async (name) => ({ file: path.join(dir, name), stat: await fs.stat(path.join(dir, name)).catch(() => null) })));
    const fresh = stats.filter((entry) => entry.stat && entry.stat.mtimeMs >= sinceMs - 1000).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0];
    if (fresh) {
      if (last && last.file === fresh.file && last.size === fresh.stat.size && fresh.stat.size > 0) return fresh.file;
      last = { file: fresh.file, size: fresh.stat.size };
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error('Timed out waiting for the exported file');
}

(async () => {
  await fs.mkdir(artifacts, { recursive: true });
  await Promise.all(['smoke.screenmovie', 'smoke-export.mp4'].map(name => fs.rm(path.join(artifacts, name), { force: true })));
  dialog.showErrorBox = (title, content) => console.error(title, content);
  let lastUnsavedFlag = null;
  ipcMain.on('set-has-unsaved-changes', (_event, value) => { lastUnsavedFlag = value; });
  const mainModule = await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href);
  await app.whenReady();
  let win = await waitFor(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('welcome')));
  await waitFor(async () => (await renderer(win, 'document.body.innerText')).includes('Ekran kaydın.'));
  check('Turkish welcome screen', true);
  await screenshot(win, 'welcome.png');
  report.permissions = { screen: systemPreferences.getMediaAccessStatus('screen'), microphone: systemPreferences.getMediaAccessStatus('microphone'), accessibility: systemPreferences.isTrustedAccessibilityClient(false) };
  const sample = path.join(artifacts, 'sample.mp4');
  const samples = Array.from({ length: 181 }, (_, index) => ({
    timeMs: index * (1000 / 30),
    cx: index < 90 ? 0.34 : 0.7,
    cy: index < 90 ? 0.4 : 0.6,
    cursorType: 'arrow',
    interactionType: index === 45 || index === 120 ? 'click' : 'move',
  }));
  await fs.writeFile(`${sample}.cursor.json`, JSON.stringify({ version: 2, samples }));
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [sample] });
  await renderer(win, `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Video içe aktar')).click()`);
  win = await waitFor(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('editor')));
  await waitFor(async () => renderer(win, `!!document.querySelector('video') && document.querySelector('video').readyState >= 2`));
  check('Import video into editor', true);
  const video = await renderer(win, `({ width: document.querySelector('video').videoWidth, height: document.querySelector('video').videoHeight, duration: document.querySelector('video').duration })`);
  check('Video decoded', video.width === 1280 && video.duration >= 6, JSON.stringify(video));
  await delay(1500);
  await screenshot(win, 'editor.png');
  // Generated zooms and the default wallpaper are not edits: nothing to undo or save yet.
  check('Unedited recording has no unsaved changes', lastUnsavedFlag === false);
  check('Automatic setup adds no undo step', await renderer(win, `document.querySelector('button[aria-label="Geri al"]').disabled`));
  await renderer(win, `document.querySelector('[data-testid="tool-zoom"]').click()`);
  await waitFor(() => lastUnsavedFlag === true);
  check('An edit marks the recording unsaved', true);
  // Save & Close followed by cancel must keep the new unsaved project open.
  dialog.showMessageBoxSync = () => 0;
  dialog.showSaveDialog = async () => ({ canceled: true });
  win.close();
  await delay(1200);
  check('Canceling Save & Close preserves new project', !win.isDestroyed());
  const project = path.join(artifacts, 'smoke.screenmovie');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: project });
  win.webContents.send('menu-save-project');
  await waitFor(() => fs.stat(project).catch(() => null));
  const saved = JSON.parse(await fs.readFile(project, 'utf8'));
  check('Project saved', saved.version === 1 && saved.videoPath === sample);
  check('Automatic zoom generated from click telemetry', saved.editor.zoomRegions.length > 0, `${saved.editor.zoomRegions.length} zoom regions`);
  async function click(selector) {
    await renderer(win, `document.querySelector(${JSON.stringify(selector)}).click()`);
    await delay(120);
  }
  async function saveUntil(predicate) {
    win.webContents.send('menu-save-project');
    return waitFor(async () => {
      const data = JSON.parse(await fs.readFile(project, 'utf8'));
      return predicate(data.editor) ? data.editor : null;
    });
  }
  const initialWallpaper = saved.editor.wallpaper;
  await renderer(win, `Array.from(document.querySelectorAll('[role="tab"]')).find(b=>b.textContent==='Görünüm').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}))`);
  await delay(180);
  await click('[data-testid="preset-studio"]');
  let edited = await saveUntil(editor => editor.wallpaper.startsWith('linear-gradient'));
  check('Style preset applies appearance', edited.padding === 48 && edited.borderRadius === 18);
  await click('button[aria-label="Geri al"]');
  edited = await saveUntil(editor => editor.wallpaper === initialWallpaper);
  check('Undo restores appearance', edited.wallpaper === initialWallpaper);
  await click('button[aria-label="İleri al"]');
  edited = await saveUntil(editor => editor.padding === 48);
  check('Redo restores preset', edited.borderRadius === 18);
  // Dragging a slider (here: shadow) is one undo step, not one per value.
  const beforeDrag = await saveUntil(() => true);
  // Steps are sent from inside the page so IPC latency cannot stretch the drag.
  await renderer(win, `(async () => { const thumb = document.querySelector('[role="slider"][aria-valuemax="1"]'); for (let step = 0; step < 5; step += 1) { thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await new Promise(resolve => setTimeout(resolve, 60)); } })()`);
  const afterDrag = await saveUntil(editor => JSON.stringify(editor) !== JSON.stringify(beforeDrag));
  const draggedKeys = Object.keys(afterDrag).filter(key => JSON.stringify(afterDrag[key]) !== JSON.stringify(beforeDrag[key]));
  await click('button[aria-label="Geri al"]');
  const undoneDrag = await saveUntil(editor => draggedKeys.every(key => JSON.stringify(editor[key]) === JSON.stringify(beforeDrag[key])));
  check('One undo reverts a whole slider drag', draggedKeys.length > 0 && undoneDrag.borderRadius === 18, draggedKeys.join(','));
  await click('button[aria-label="İleri al"]');
  await saveUntil(editor => draggedKeys.every(key => JSON.stringify(editor[key]) === JSON.stringify(afterDrag[key])));
  await click('button[aria-label="Görünümü kaydet"]');
  await renderer(win, `(() => {
    const input = document.querySelector('input[aria-label="Stil adı"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Demo görünümü');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await click('button[aria-label="Stili kaydet"]');
  check('Custom style preset persisted', await renderer(win, `JSON.parse(localStorage.getItem('screenmovie.stylePresets.v1')).some(p => p.name === 'Demo görünümü' && p.appearance.padding === 48)`));

  // Cut works like Premiere: split at the playhead, then delete the part.
  await renderer(win, `document.querySelector('video').currentTime = 1.5`);
  await delay(400);
  await click('[data-testid="tool-trim"]');
  edited = await saveUntil(editor => (editor.clipSplits || []).length === 1);
  check('Toolbar Cut splits the video at the playhead', edited.clipSplits[0] === 1500, JSON.stringify(edited.clipSplits));
  await click('[data-testid="clip-segment"][data-start="0"]');
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Delete' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Delete' });
  edited = await saveUntil(editor => editor.trimRegions.length === 1);
  check('Deleting a part cuts it out', edited.trimRegions[0].startMs === 0 && edited.trimRegions[0].endMs === 1500, JSON.stringify(edited.trimRegions));
  await click('[data-testid="cut-marker"]');
  await renderer(win, `(() => {
    const input = document.querySelector('[data-testid="region-start"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '-1');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await renderer(win, `document.querySelector('[aria-label="Seçili bölge"] form').requestSubmit()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="region-start"][aria-invalid="true"]')`));
  check('Invalid timing rejected', true);
  await renderer(win, `(() => {
    for (const [id, value] of [['region-start', '0.2'], ['region-end', '1.2']]) {
      const input = document.querySelector('[data-testid="'+id+'"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);
  await renderer(win, `document.querySelector('[aria-label="Seçili bölge"] form').requestSubmit()`);
  edited = await saveUntil(editor => editor.trimRegions[0]?.startMs === 200 && editor.trimRegions[0]?.endMs === 1200);
  check('Precise timing saved', true);
  await click('[data-testid="tool-speed"]');
  edited = await saveUntil(editor => editor.speedRegions.length === 1);
  check('Toolbar adds speed region', edited.speedRegions[0].speed === 1.5);
  await screenshot(win, 'editor-tools.png');
  await click('[data-testid="tool-text"]');
  edited = await saveUntil(editor => editor.annotationRegions.length === 1);
  check('Toolbar adds text annotation', edited.annotationRegions[0].type === 'text');
  check('New text has no burned-in placeholder', edited.annotationRegions[0].content === '' && edited.annotationRegions[0].textContent === '');
  check('Placeholder is only an input hint', await renderer(win, `document.querySelector('textarea').value === '' && !!document.querySelector('textarea').placeholder`));
  check('No upstream branding in editor', await renderer(win, `!document.body.innerText.toLowerCase().includes('recordly')`));

  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(root, 'projects/Studio-Demo/assets/demo-audio.m4a')] });
  await click('button[aria-label="Ses dosyası ekle"]');
  edited = await saveUntil(editor => editor.audioRegions.length === 1);
  check('Audio inspector opens for new track', await renderer(win, `!!document.querySelector('[data-testid="audio-volume"]') && !!document.querySelector('[data-testid="region-start"]')`));
  await renderer(win, `(() => { const input = document.querySelector('[data-testid="audio-volume"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '35'); input.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  edited = await saveUntil(editor => editor.audioRegions[0]?.volume === 0.35);
  check('Audio volume saved', true);
  await click('[data-testid="audio-mute"]');
  await saveUntil(editor => editor.audioRegions[0]?.volume === 0);
  await click('[data-testid="audio-mute"]');
  await saveUntil(editor => editor.audioRegions[0]?.volume === 0.35);
  check('Unmute restores previous volume', true);
  await renderer(win, `document.querySelector('video').currentTime = document.querySelector('video').duration`);
  await delay(300);
  await click('button[aria-label="Oynat"]');
  // Playback restarts from the beginning; the trim at 0.2–1.2 s is skipped, so allow a few seconds.
  await waitFor(() => renderer(win, `!document.querySelector('video').paused && document.querySelector('video').currentTime < 3`));
  check('Play at end restarts video', true);
  await renderer(win, `document.querySelector('video').pause()`);
  await screenshot(win, 'editor-annotation.png');
  const recent = await renderer(win, `window.electronAPI.listRecentProjects()`);
  check('Saved project appears in library', recent.some(entry => entry.path === project));
  await renderer(win, `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Dışa aktar').click()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="export-setup"]')`));
  check('Export first opens settings without rendering', await renderer(win, `!!document.querySelector('[data-testid="confirm-export"]')`));
  await renderer(win, `(() => { const select = document.querySelector('[data-testid="export-resolution"]'); select.value = 'custom'; select.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  await delay(200);
  await renderer(win, `(() => { for(const [index,value] of [[0,'640'],[1,'360']]) { const input = document.querySelectorAll('section[aria-label="Çıktı ölçüleri"] input')[index]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', {bubbles:true})); } })()`);
  await renderer(win, `document.querySelector('section[aria-label="Çıktı ölçüleri"] form').requestSubmit()`);
  await renderer(win, `(() => { const select = document.querySelector('[data-testid="export-fps"]'); select.value = '30'; select.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  await saveUntil(editor => editor.exportResolution === 'custom' && editor.exportCustomWidth === 640 && editor.exportCustomHeight === 360 && editor.exportFps === 30);
  check('Custom resolution and FPS saved in project', await renderer(win, `document.querySelector('[data-testid="export-dimensions"]').textContent.includes('640 × 360')`));
  // Changing the frame shape keeps a custom export size in step with the preview.
  await renderer(win, `Array.from(document.querySelectorAll('[role="dialog"] button')).find(b=>b.textContent.trim()==='Vazgeç').click()`);
  await waitFor(() => renderer(win, `!document.querySelector('[role="dialog"]')`));
  await renderer(win, `Array.from(document.querySelectorAll('[role="tab"]')).find(b=>b.textContent==='Görünüm').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}))`);
  await click('[data-testid="preset-social"]');
  await saveUntil(editor => editor.aspectRatio === '9:16' && editor.exportCustomWidth === 360 && editor.exportCustomHeight === 640);
  check('Custom size follows aspect ratio', true);
  await click('button[aria-label="Geri al"]');
  await saveUntil(editor => editor.exportCustomWidth === 640 && editor.exportCustomHeight === 360);
  check('Undoing the aspect ratio restores the custom size', true);
  const exported = path.join(artifacts, 'smoke-export.mp4');
  const exportStartedAt = Date.now();
  await renderer(win, `Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('dışa aktar')).click()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="confirm-export"]')`));
  await click('[data-testid="confirm-export"]');
  await fs.copyFile(await waitForExportFile('.mp4', exportStartedAt), exported);
  check('MP4 exported through editor', (await fs.stat(exported)).size > 1000);
  // Reload the exact saved project through the library IPC, then restore editor state.
  const restored = await renderer(win, `window.electronAPI.openRecentProject(${JSON.stringify(project)})`);
  check('Recent project opens', restored.success);
  win.webContents.reload();
  await delay(500);
  await waitFor(async () => renderer(win, `!!document.querySelector('video') && document.querySelector('video').readyState >= 2`));
  check('Project reload restores media', true);
  await renderer(win, `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Dışa aktar').click()`);
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="export-fps"]')`));
  check('Project reload restores resolution and FPS', await renderer(win, `document.querySelector('[data-testid="export-fps"]').value === '30' && document.querySelector('[data-testid="export-dimensions"]').textContent.includes('640 × 360')`));
  await screenshot(win, 'editor-restored.png');
  await renderer(win, `Array.from(document.querySelectorAll('[role="dialog"] button')).find(b=>b.textContent.trim()==='Vazgeç').click()`);
  await waitFor(() => renderer(win, `!document.querySelector('[role="dialog"]')`));
  if (process.env.SCREENMOVIE_TEST_QUIT === '1') {
    await click('[data-testid="preset-midnight"]');
    await delay(300);
    let quitAttempts = 0;
    app.on('before-quit', () => { quitAttempts++; });
    app.once('will-quit', () => {
      const savedOnQuit = JSON.parse(require('node:fs').readFileSync(project, 'utf8'));
      check('Save and Quit completes application exit', quitAttempts >= 2 && savedOnQuit.editor.wallpaper.includes('#141428'));
      require('node:fs').writeFileSync(path.join(artifacts, 'quit-report.json'), JSON.stringify(report, null, 2));
    });
    setTimeout(() => { console.error('FAIL Save and Quit did not exit'); app.exit(1); }, 10000);
    app.quit();
    return;
  }
  await renderer(win, 'void window.electronAPI.showRecorder()');
  win = await waitFor(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('hud-overlay')));
  await waitFor(() => renderer(win, `!!Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Kaydet'))`));
  await renderer(win, `(() => { const select = document.querySelector('[data-testid="capture-resolution"]'); select.value='1080'; select.dispatchEvent(new Event('change',{bubbles:true})); const fps = document.querySelector('[data-testid="capture-fps"]'); fps.value='30'; fps.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await waitFor(() => renderer(win, `localStorage.getItem('screenmovie.captureResolution')==='1080' && localStorage.getItem('screenmovie.captureFps')==='30'`));
  check('Recording resolution and FPS preferences saved', true);
  check('Idle recorder size', win.getBounds().width === 660);
  mainModule.setHudRecordingState(true);
  win.webContents.send('recording-state-changed', { recording: true, sourceName: 'Test' });
  await waitFor(() => renderer(win, `!!document.querySelector('[data-testid="recording-compact"]')`));
  check('Recorder shrinks while recording', win.getBounds().width === 220 && win.getBounds().height === 60, JSON.stringify(win.getBounds()));
  check('Recording UI shows timer, pause and stop', await renderer(win, `document.querySelectorAll('button').length === 2 && !!document.querySelector('[role="timer"]')`));
  await screenshot(win, 'recording-compact.png');
  mainModule.setHudRecordingState(true);
  mainModule.setHudRecordingState(false);
  win.webContents.send('recording-state-changed', { recording: false, sourceName: 'Test' });
  await waitFor(() => renderer(win, `!document.querySelector('[data-testid="recording-compact"]')`));
  check('Recorder restores after stop', win.getBounds().width === 660 && win.getBounds().height === 170);

  await fs.writeFile(path.join(artifacts, 'smoke-report.json'), JSON.stringify(report, null, 2));
  console.log('REPORT', JSON.stringify(report));
  app.exit(0);
})().catch(async error => {
  report.errors.push(String(error));
  const current = BrowserWindow.getAllWindows()[0];
  if (current) {
    console.error('RENDERER', await renderer(current, 'document.body.innerText'));
    await screenshot(current, 'failure.png');
  }
  console.error(error);
  await fs.writeFile(path.join(artifacts, 'smoke-report.json'), JSON.stringify(report, null, 2));
  app.exit(1);
});
