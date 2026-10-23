const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');app.setPath('userData',path.join('/private/tmp','screenmovie-composer-'+Date.now()));app.getAppPath=()=>root;
let win;const checks=[],delay=ms=>new Promise(r=>setTimeout(r,ms)),run=s=>win.webContents.executeJavaScript(s,true);
async function wait(fn){for(let i=0;i<150;i++){if(await fn())return;await delay(100)}throw Error('Timeout')}
function check(name,passed){checks.push({name,passed:!!passed});console.log(passed?'PASS':'FAIL',name);if(!passed)throw Error(name)}
async function text(value){await run(`(()=>{const n=document.querySelector('.image-ai-request');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}))})()`);await delay(80)}
(async()=>{await import(pathToFileURL(path.join(root,'dist-electron/main.js')).href);await app.whenReady();await wait(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('welcome'));return win});await wait(()=>run('!!window.electronAPI'));
ipcMain.removeHandler('gemini-key-status');ipcMain.handle('gemini-key-status',()=>({configured:false,persistent:true}));ipcMain.removeHandler('image-studio-capabilities');ipcMain.handle('image-studio-capabilities',()=>({tools:[{id:'codex',name:'Codex',status:'ready'}],imageGeneration:true}));let requests=0;ipcMain.removeHandler('image-studio-run');ipcMain.handle('image-studio-run',async()=>{requests++;return {success:false,error:'Test response only; no external request'}});
await run(`document.querySelectorAll('.studio-mode-choice button')[1].click()`);await wait(()=>run(`!!document.querySelector('.image-ai-request')`));
check('Prompt has an associated visible label',await run(`document.querySelector('.image-prompt-label').htmlFor===document.querySelector('.image-ai-request').id`));
for(const [width,height] of [[920,680],[1180,820],[1796,1055]]){win.setSize(width,height);await delay(100);check(`Prompt, selectors and actions fit at ${width}x${height}`,await run(`(()=>{const nodes=[...document.querySelectorAll('.image-ai-request,.image-ai-actions button,.image-ai-toolbar select')];return nodes.every(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&n.clientWidth>=n.scrollWidth-2})})()`));check(`Empty placeholder fits without clipped lines at ${width}x${height}`,await run(`(()=>{const n=document.querySelector('.image-ai-request');return n.scrollHeight<=n.clientHeight+1})()`))}
win.setSize(1180,820);await delay(100);await fs.writeFile(path.join(root,'artifacts/prompt-composer.png'),(await win.webContents.capturePage()).toPNG());
const original=await run(`document.querySelector('.image-ai-request').clientHeight`);await text(Array(20).fill('Türkçe bir kampanya görseli; ürün kimliğini, logosunu ve tüm açıklamaları koru.').join('\n'));
check('Long text grows the writing surface and remains scrollable',await run(`document.querySelector('.image-ai-request').clientHeight>${original}&&getComputedStyle(document.querySelector('.image-ai-request')).overflowY==='auto'`));
await run(`const input=document.querySelector('.image-ai-request');input.focus();input.scrollTop=input.scrollHeight`);
check('Last lines can be reached in a long prompt',await run(`(()=>{const n=document.querySelector('.image-ai-request');return n.scrollTop+n.clientHeight>=n.scrollHeight-1})()`));
await text('');await run(`document.querySelector('.image-prompt-starters button').click()`);
check('Starter populates the one prompt and focuses it',await run(`document.querySelector('.image-ai-request').value.includes('stüdyo çekimi')&&document.activeElement===document.querySelector('.image-ai-request')&&document.querySelectorAll('.image-ai-simple textarea').length===1`));
await win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter',modifiers:['control']});await win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter',modifiers:['control']});await wait(()=>requests===1);
check('Ctrl Enter triggers a single generation request',requests===1);
await wait(()=>run(`document.querySelector('.image-ai-status').textContent.includes('Test response')`));
check('Failure keeps the prompt and restores composer controls',await run(`!!document.querySelector('.image-ai-request').value&&!document.querySelector('.image-ai-generate').disabled`));
await run(`document.querySelector('[aria-label="AI bağlantı ayarları"]').click()`);
check('Connection settings still open separately',await run(`document.querySelector('.image-ai-settings').open`));
await fs.writeFile(path.join(root,'artifacts/prompt-composer-report.json'),JSON.stringify({checks,note:'Isolated profile. AI response mocked, no paid generation or user data changes.'},null,2));app.exit(0);
})().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,'artifacts/prompt-composer-report.json'),JSON.stringify({checks,error:String(error)},null,2));app.exit(1)});
