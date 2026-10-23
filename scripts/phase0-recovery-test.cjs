// Production renderer, two separate processes, isolated user data; no user projects modified.
const {app,BrowserWindow,dialog}=require('electron');const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),artifacts=path.join(root,'artifacts'),mode=process.argv[2]||'seed';
app.setPath('userData',path.join(artifacts,'phase0-recovery-profile'));app.setName('ScreenMovie Recovery Test');app.getAppPath=()=>root;
const delay=ms=>new Promise(r=>setTimeout(r,ms));async function wait(fn){for(let i=0;i<300;i++){const v=await fn();if(v)return v;await delay(100)}throw Error('Timed out waiting for recovery flow')}
let win;const run=s=>win.webContents.executeJavaScript(s,true);const original=path.join(artifacts,'recovery-original.screenmovie'),copy=path.join(artifacts,'recovery-copy.screenmovie');
function check(name,pass){console.log(pass?'PASS':'FAIL',name);if(!pass)throw Error(name)}
async function clickText(label){await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)}).click()`)}
async function editor(){win=await wait(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('editor')));await wait(()=>run(`document.querySelector('video')?.readyState>=2`));await delay(900)}
(async()=>{await import(pathToFileURL(path.join(root,'dist-electron/main.js')).href);await app.whenReady();win=await wait(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('welcome')));await wait(()=>run(`!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Video içe aktar'))`));
if(mode==='seed'){
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(artifacts,'sample.mp4')]});await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Video içe aktar')).click()`);await editor();dialog.showSaveDialog=async()=>({canceled:false,filePath:original});await clickText('Kaydet');await wait(()=>fs.stat(original).catch(()=>null));
 await run(`document.querySelector('[data-testid="preset-midnight"]').click();document.querySelector('video').currentTime=2.5`);await wait(()=>run(`document.querySelector('[data-testid="draft-status"]')?.textContent.includes('korumaya')`));
 const entries=await run('window.electronAPI.listProjectRecovery()');check('Dirty edits persist as automatic draft',entries.some(e=>e.kind==='draft'));
 await fs.writeFile(path.join(artifacts,'recovery-original-before.json'),await fs.readFile(original));check('Draft did not overwrite original project',JSON.parse(await fs.readFile(original,'utf8')).editor.padding!==40);
 console.log('KILL isolated process with unsaved edits');process.kill(process.pid,'SIGKILL');
}else{
 await wait(()=>run(`document.body.innerText.includes('Taslaklar ve yedekler')`));check('Recovery offered after process restart',await run(`document.body.innerText.includes('Otomatik taslak')`));await fs.writeFile(path.join(artifacts,'recovery-welcome.png'),(await win.webContents.capturePage()).toPNG());await clickText('Kopyayı kurtar');await editor();
 check('Recovery restores playhead',await run(`Math.abs(document.querySelector('video').currentTime-2.5)<.12`));
 check('Recovered copy is marked unsaved',await run(`document.body.innerText.includes('Kaydedilmemiş değişiklik')`));dialog.showSaveDialog=async()=>({canceled:false,filePath:copy});await clickText('Kaydet');await wait(()=>fs.stat(copy).catch(()=>null));check('Recovered changes saved into a new project',JSON.parse(await fs.readFile(copy,'utf8')).editor.padding===40);
 check('Original remains byte-for-byte unchanged',(await fs.readFile(original,'utf8'))===(await fs.readFile(path.join(artifacts,'recovery-original-before.json'),'utf8')));
 await run(`document.querySelector('[data-testid="preset-studio"]').click()`);await clickText('Kaydet');await wait(async()=>JSON.parse(await fs.readFile(copy,'utf8')).editor.padding===48);const entries=await run('window.electronAPI.listProjectRecovery()');check('Prior saved version retained as backup',entries.some(e=>e.kind==='backup'));check('Successful save clears recovered draft',!entries.some(e=>e.kind==='draft'));
 await fs.writeFile(path.join(artifacts,'recovery-editor.png'),(await win.webContents.capturePage()).toPNG());app.exit(0);
}
})().catch(async e=>{console.error(e);if(win&&!win.isDestroyed()){console.error(await run('document.body.innerText'));await fs.writeFile(path.join(artifacts,'recovery-failure.png'),(await win.webContents.capturePage()).toPNG())}app.exit(1)});
