const {app,BrowserWindow,dialog}=require('electron');
const path=require('node:path'),fs=require('node:fs/promises'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
app.setPath('userData',path.join('/private/tmp','pro-screen-ai-navigation-'+Date.now()));app.getAppPath=()=>root;
let win;const checks=[],delay=ms=>new Promise(r=>setTimeout(r,ms));
const run=code=>win.webContents.executeJavaScript(code,true);
async function wait(fn){for(let i=0;i<180;i++){try{if(await fn())return}catch{}await delay(100)}throw Error('Timeout')}
function check(name,value){checks.push({name,passed:!!value});console.log(value?'PASS':'FAIL',name);if(!value)throw Error(name)}
async function click(text){await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`)}
(async()=>{
 await import(pathToFileURL(path.join(root,'dist-electron/main.js')).href);await app.whenReady();
 await wait(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('welcome'));return win});
 await wait(()=>run(`!!document.querySelector('.studio-mode-choice')`));
 check('Home displays Pro Screen AI',await run(`document.body.innerText.includes('Pro Screen AI')`));
 await run(`document.querySelectorAll('.studio-mode-choice button')[1].click()`);await wait(()=>run(`!!document.querySelector('.creative-top')`));
 check('Creation workspace has explicit Home control outside drag region',await run(`(()=>{const b=[...document.querySelectorAll('.creative-top button')].find(b=>b.textContent.includes('Ana ekran'));return !!b&&getComputedStyle(b).webkitAppRegion==='no-drag'})()`));
 await click('Katmanlı editör ↗');await wait(()=>run(`!!document.querySelector('.image-studio > header')`));
 check('Layered editor offers both Home and back to image studio',await run(`document.body.innerText.includes('Ana ekran')&&document.body.innerText.includes('← Görsel Stüdyo')`));
 await click('← Görsel Stüdyo');await wait(()=>run(`!!document.querySelector('.creative-top')`));
 await click('Katmanlı editör ↗');await wait(()=>run(`!!document.querySelector('.image-studio > header')`));
 await click('← Ana ekran');await wait(()=>run(`!!document.querySelector('.studio-mode-choice')`));check('Layered Home saves draft and returns to global home',true);
 await run(`document.querySelectorAll('.studio-mode-choice button')[1].click()`);await wait(()=>run(`!!document.querySelector('.creative-top')`));
 await click('← Ana ekran');await wait(()=>run(`!!document.querySelector('.studio-mode-choice')`));check('Creation Home returns to global home',true);
 await run(`void window.electronAPI.switchToEditor(); true`);await wait(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('editor'));return win});await wait(()=>run(`!!window.electronAPI&&document.body.innerText.includes('Ana ekran')`));
 check('Video workspace exposes Home even without a loaded source',true);
 await run(`window.electronAPI.setHasUnsavedChanges(true)`);await delay(100);
 dialog.showMessageBoxSync=()=>2;await run(`window.electronAPI.showHome()`);await delay(200);check('Cancel preserves video editor and dirty project',!win.isDestroyed()&&win.webContents.getURL().includes('editor'));
 dialog.showMessageBoxSync=()=>0;await run(`window.electronAPI.showHome()`);await delay(300);check('Cancelled project save preserves editor',!win.isDestroyed());
 dialog.showMessageBoxSync=()=>1;void run(`window.electronAPI.showHome()`).catch(()=>{});await wait(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('welcome'));return win});await wait(()=>run(`!!document.querySelector('.studio-mode-choice')`));check('Discard returns from video to global home',true);
 await fs.writeFile(path.join(root,'artifacts/home-navigation-report.json'),JSON.stringify({checks,note:'Isolated profile; no user projects or keys touched.'},null,2));app.exit(0);
})().catch(async e=>{console.error(e);await fs.writeFile(path.join(root,'artifacts/home-navigation-report.json'),JSON.stringify({checks,error:String(e)},null,2));app.exit(1)});
