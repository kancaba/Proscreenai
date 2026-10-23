const {app,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs/promises'); const path=require('node:path'); const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'), dir=path.join(root,'projects/Studio-Demo');
app.setPath('userData',path.join(root,'artifacts/full-demo-gif-profile'));app.setName('ScreenMovie Demo Test');app.getAppPath=()=>root;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,timeout=120000){const end=Date.now()+timeout;while(Date.now()<end){const r=await fn();if(r)return r;await delay(250)}throw Error('Timeout')}
const report=[];function check(name,ok){report.push({name,passed:!!ok});console.log(ok?'PASS':'FAIL',name);if(!ok)throw Error(name)}
(async()=>{await import(pathToFileURL(path.join(root,'dist-electron/main.js')).href);await app.whenReady();let win=await wait(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('welcome')));let run=code=>win.webContents.executeJavaScript(code,true);
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(dir,'Studio-Demo.screenmovie')]});
await wait(()=>run(`!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Proje aç'))`));
await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Proje aç')).click()`);
win=await wait(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('editor')));
await wait(()=>run(`document.querySelector('video')?.readyState>=2`));await run(`document.querySelector('video').pause();document.querySelector('video').currentTime=0`);await delay(2000);
check('12 second demo decoded',await run(`document.querySelector('video').duration===12`));
const text=await run('document.body.innerText');check('All timeline tracks restored',text.includes('demo-audio')&&text.includes('0.5×')&&text.includes('2×')&&text.includes('Trim'));
check('Anotasyon tracks restored',text.includes('Fikrinden ilk paylaş') && text.includes('Image'));
await fs.writeFile(path.join(dir,'Editor.png'),(await win.webContents.capturePage()).toPNG());
for(const format of ['gif']){const output=path.join(dir,'Studio-Demo.'+format);dialog.showSaveDialog=async()=>({canceled:false,filePath:output});
await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(format.toUpperCase())}).click()`);await delay(300);
await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.toLowerCase().includes('dışa aktar')).click()`);
await wait(()=>fs.stat(output).catch(()=>null),240000);check(format.toUpperCase()+' full composition exported',(await fs.stat(output)).size>10000);await delay(1000);}
await fs.writeFile(path.join(dir,'feature-test.json'),JSON.stringify(report,null,2));app.exit(0);
})().catch(async e=>{console.error(e);await fs.writeFile(path.join(dir,'feature-test.json'),JSON.stringify({checks:report,error:String(e)},null,2));app.exit(1)});
