const {app,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'), dir=path.join(root,'artifacts');
app.setPath('userData',path.join(dir,'resolution-matrix-profile'));app.setName('ScreenMovie Resolution Test');app.getAppPath=()=>root;
const delay=ms=>new Promise(r=>setTimeout(r,ms));async function wait(fn,ms=60000){const until=Date.now()+ms;while(Date.now()<until){const result=await fn();if(result)return result;await delay(200)}throw Error('State timed out')}
(async()=>{const base=JSON.parse(await fs.readFile(path.join(dir,'smoke.screenmovie'),'utf8'));const cases=[{name:'portrait1080',aspectRatio:'9:16',exportResolution:'1080',exportFps:30},{name:'landscape4k',aspectRatio:'16:9',exportResolution:'2160',exportFps:60}];
for(const test of cases){const project=structuredClone(base);project.videoPath=path.join(dir,'resolution-sample.mp4');Object.assign(project.editor,test,{zoomRegions:[],trimRegions:[],speedRegions:[],annotationRegions:[],audioRegions:[],exportQuality:'good',exportFormat:'mp4'});await fs.writeFile(path.join(dir,test.name+'.screenmovie'),JSON.stringify(project));await fs.rm(path.join(dir,test.name+'.mp4'),{force:true});}
await import(pathToFileURL(path.join(root,'dist-electron/main.js')).href);await app.whenReady();let win=await wait(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('welcome')));const run=code=>win.webContents.executeJavaScript(code,true);await wait(()=>run(`!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Proje aç'))`));
for(const test of cases){dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(dir,test.name+'.screenmovie')]});dialog.showSaveDialog=async()=>({canceled:false,filePath:path.join(dir,test.name+'.mp4')});
if(win.webContents.getURL().includes('welcome'))await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Proje aç')).click()`);else win.webContents.send('menu-load-project');
win=await wait(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('editor')));await wait(()=>run(`document.body.innerText.includes(${JSON.stringify(test.name+'.screenmovie')}) && document.querySelector('video')?.readyState>=2`));await delay(1200);
console.log('EXPORT',test.name,await run(`document.querySelector('[data-testid="export-dimensions"]').textContent`));
await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Video dışa aktar').click()`);await wait(()=>fs.stat(path.join(dir,test.name+'.mp4')).catch(()=>null),180000);console.log('PASS',test.name);await delay(2500);}
app.exit(0)})().catch(error=>{console.error(error);app.exit(1)});
