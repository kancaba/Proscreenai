const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
app.setPath('userData', path.join('/private/tmp', 'screenmovie-home-workspaces-' + Date.now()));
app.getAppPath = () => root;
let win;
const checks = [];
const delay = ms => new Promise(r => setTimeout(r, ms));
const run = code => win.webContents.executeJavaScript(code, true);
async function wait(fn) { for (let i = 0; i < 150; i++) { if (await fn()) return; await delay(100); } throw Error('Timeout'); }
function check(name, passed) { checks.push({ name, passed: !!passed }); console.log(passed ? 'PASS' : 'FAIL', name); if (!passed) throw Error(name); }
(async () => {
 await import(pathToFileURL(path.join(root, 'dist-electron/main.js')).href);
 await app.whenReady();
 await wait(() => { win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('welcome')); return win; });
 await wait(() => run(`!!document.querySelector('.studio-mode-choice')`));
 check('Cold start loads home card styles before image editor', await run(`getComputedStyle(document.querySelector('.studio-mode-choice')).display==='grid'&&!document.querySelector('.image-studio')&&!document.querySelector('.creative-studio')`));
 for (const [width, height] of [[920,680],[1180,820],[1796,1055]]) {
  win.setSize(width,height); await delay(120);
  check(`Separate visible workspace cards at ${width}x${height}`, await run(`(()=>{const cards=[...document.querySelectorAll('.studio-mode-choice button')];const [a,b]=cards.map(n=>n.getBoundingClientRect());return cards.length===2&&a.width>200&&b.width>200&&b.left>a.right&&a.top===b.top&&b.right<=innerWidth&&cards.every(n=>getComputedStyle(n.querySelector('strong')).display==='block'&&getComputedStyle(n).borderTopStyle==='solid')})()`));
 }
 win.setSize(1180,820); await delay(100);
 await fs.writeFile(path.join(root,'artifacts/home-workspaces.png'),(await win.webContents.capturePage()).toPNG());
 ipcMain.removeHandler('show-recorder');let recordingRequests=0;ipcMain.handle('show-recorder',()=>{recordingRequests++;});
 await run(`document.querySelector('.studio-mode-choice button').click()`);
 await wait(()=>recordingRequests===1);check('Video choice starts recording through the recorder IPC',recordingRequests===1);
 await run(`document.querySelectorAll('.studio-mode-choice button')[1].click()`);
 await wait(()=>run(`!!document.querySelector('.creative-studio')`));
 check('Image choice opens independent image workspace',true);
 await win.webContents.reload();
 await wait(()=>run(`!!document.querySelector('.studio-mode-choice')`));
 check('Reload retains styled independent entry cards',await run(`getComputedStyle(document.querySelector('.studio-mode-choice')).display==='grid'`));
 // The following fixtures live exclusively in this test's temporary profile.
 ipcMain.removeHandler('list-recent-projects');
 ipcMain.handle('list-recent-projects',()=>[{path:'/test/Demo.screenmovie',name:'Demo project',updatedAt:new Date().toISOString()}]);
 ipcMain.removeHandler('list-project-recovery');
 ipcMain.handle('list-project-recovery',()=>[{id:'test-draft',kind:'draft',name:'Draft fixture',updatedAt:new Date().toISOString()}]);
 const png='data:image/png;base64,'+(await fs.readFile(path.join(root,'artifacts/image-ai-real.png'))).toString('base64');
 await run(`(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('screenmovie-creative-library',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});await new Promise((resolve,reject)=>{const tx=db.transaction('creations','readwrite'),store=tx.objectStore('creations');for(let n=1;n<=8;n++)store.put({id:'home-fixture-'+n,name:'Fixture '+n,src:${JSON.stringify(png)},prompt:'Image prompt '+n,createdAt:n,brandId:'',productId:'',width:1254,height:1254});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()})()`);
 await win.webContents.reload();
 await wait(()=>run(`document.querySelectorAll('.home-image-grid button').length===4`));
 check('Workbench loads only four newest images in descending order',await run(`[...document.querySelectorAll('.home-image-grid strong')].map(n=>n.textContent).join(',')==='Fixture 8,Fixture 7,Fixture 6,Fixture 5'`));
 check('Video projects and image history occupy independent panels',await run(`document.querySelectorAll('.home-libraries>section').length===2&&document.querySelector('.home-video-list').textContent.includes('Demo project')`));
 check('Drafts are compact by default and can be expanded',await run(`!document.querySelector('[aria-label="Proje kurtarma"] details').open`));
 await run(`document.querySelector('[aria-label="Proje kurtarma"] summary').click()`);
 check('Draft entries remain reachable',await run(`document.querySelector('[aria-label="Proje kurtarma"] details').open&&document.querySelector('.studio-recovery-entry').textContent.includes('Draft fixture')`));
 await run(`document.querySelector('[aria-label="Proje kurtarma"] summary').click();document.querySelector('.home-desk').scrollIntoView()`);
 await delay(100);
 await fs.writeFile(path.join(root,'artifacts/home-workbench.png'),(await win.webContents.capturePage()).toPNG());
 for(const [width,height] of [[920,680],[1796,1055]]){win.setSize(width,height);await delay(100);check(`Workbench panels fit at ${width}x${height}`,await run(`[...document.querySelectorAll('.home-library')].every(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&n.scrollWidth<=n.clientWidth})`))}
 await run(`document.querySelector('.home-image-grid button').click()`);
 await wait(()=>run(`document.querySelector('.creative-lightbox')?.open`));
 check('Clicking home image opens its exact large preview',await run(`document.querySelector('.creative-lightbox footer>p').textContent==='Image prompt 8'`));
 await run(`document.querySelector('[aria-label="Önizlemeyi kapat"]').click();document.querySelector('.creative-wordmark').click()`);
 await wait(()=>run(`!!document.querySelector('.home-shortcuts')`));
 await run(`document.querySelector('.home-shortcuts>button:last-child').click()`);
 await wait(()=>run(`!!document.querySelector('.creative-studio')`));
 check('Gallery shortcut opens gallery without an unwanted preview',await run(`document.querySelector('.creative-top nav .active').textContent.includes('Galeri')&&!document.querySelector('.creative-lightbox')`));
 await run(`document.querySelector('.creative-wordmark').click()`);
 await wait(()=>run(`!!document.querySelector('.studio-mode-choice')`));
 await run(`document.querySelectorAll('.studio-mode-choice button')[1].click()`);
 await wait(()=>run(`!!document.querySelector('.creative-studio')`));
 check('Main image card still opens free creation after gallery navigation',await run(`document.querySelector('.creative-top nav .active').textContent.includes('Oluştur')&&!document.querySelector('.creative-lightbox')`));
 await fs.writeFile(path.join(root,'artifacts/home-workspaces-report.json'),JSON.stringify({checks,note:'Cold built renderer in isolated Electron profile; no AI requests or user data modified.'},null,2));
 app.exit(0);
})().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,'artifacts/home-workspaces-report.json'),JSON.stringify({checks,error:String(error)},null,2));app.exit(1)});
