// Isolated Electron integration test. ALL HTTP calls are intercepted; never uses paid services.
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const profile = path.join('/private/tmp', 'screenmovie-byteplus-test-' + Date.now());
app.setPath('userData', profile);
app.getAppPath = () => root;
let win, posts = 0, downloads = 0, chats = 0, lastChat, nextStatus = 200, downloadFails = false, lastBody, lastHeaders;
const checks = [];
const image = nativeImage.createFromPath(path.join(root, 'public/branding/pro-screen-ai-icon-512.png')).resize({width:320,height:400}).toPNG();
const url = 'https://fake.tos-ap-southeast-1.volces.com/output.png?mock-signature';
global.fetch = async (target, init = {}) => {
  if (String(target) === 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations') {
    posts++; lastBody = JSON.parse(init.body); lastHeaders = init.headers;
    await new Promise(resolve => setTimeout(resolve, 150));
    return nextStatus === 200
      ? new Response(JSON.stringify({ model:lastBody.model, data:[{url,size:'320x400'}], usage:{generated_images:1,output_tokens:500,total_tokens:500} }))
      : new Response(JSON.stringify({error:{message:'do-not-display-secret'}}), {status:nextStatus});
  }
  if (String(target) === 'https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions') {
    chats++; lastChat = JSON.parse(init.body);
    if (init.headers?.Authorization !== 'Bearer fake-modelark-key-test-only') throw Error('Writer without key');
    return new Response(JSON.stringify({ choices:[{ message:{ content: JSON.stringify({ prompt:'A calm black commemorative poster, headline centred at 40% height in thin white type.', copy:'10 KASIM\nSaygıyla anıyoruz.', warnings:['Gerçek fotoğrafı sonradan ekleyin.'] }) } }], usage:{ prompt_tokens:3000, completion_tokens:800 } }));
  }
  if (String(target) === url) {
    downloads++;
    if (init.headers?.Authorization) throw Error('Credential leaked to download');
    return downloadFails ? new Response('expired', {status:403}) : new Response(image, {headers:{'content-type':'image/png'}});
  }
  throw Error('Unexpected network request blocked by test');
};
const delay = ms => new Promise(r => setTimeout(r, ms));
const run = source => win.webContents.executeJavaScript(source, true);
async function wait(predicate) { for(let i=0;i<150;i++){if(await predicate())return;await delay(100);}throw Error('Timed out'); }
function check(name, value) { checks.push({name,passed:!!value}); console.log(value ? 'PASS' : 'FAIL',name); if(!value)throw Error(name); }
async function field(label,value) {
  await run(`(()=>{const e=document.querySelector('[aria-label=${JSON.stringify(label)}]');if(!e)throw Error('Missing field');Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  await delay(80);
}
async function click(text) { await run(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing button');b.click();})()`); await delay(80); }
const options = {model:'dola-seedream-5-0-flash-260915',size:'1.5K',posterType:'sale',visibleText:'İndirim\nŞimdi Keşfet',watermark:true,budgetUSD:1};
const request = () => ({requestId:randomUUID(),mode:'generate',tool:'byteplus',prompt:'Premium bir ürün posteri',references:[],width:1080,height:1350,byteplus:options});
(async () => {
  await import(pathToFileURL(path.join(root,'dist-electron/main.js')).href);
  await app.whenReady();
  ipcMain.removeHandler('image-studio-capabilities');
  ipcMain.handle('image-studio-capabilities',()=>({tools:[],imageGeneration:false,note:'Mocked'}));
  await wait(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('welcome'));return !!win;});
  await wait(()=>run('!!window.electronAPI'));
  await run(`document.querySelectorAll('.studio-mode-choice button')[1].click()`);
  await wait(()=>run('!!document.querySelector(".creative-studio")'));
  await field('Görsel üretim aracı','byteplus');
  await wait(()=>run('!!document.querySelector(".byteplus-controls")'));
  check('Create screen exposes API model, size, poster and budget controls', await run(`['Seedream modeli','Seedream çözünürlüğü','Poster türü','Posterde kullanılacak metin','BytePlus harcama sınırı USD'].every(label=>!!document.querySelector('[aria-label="'+label+'"]'))`));
  await field('Seedream modeli','seedream-5-0-lite-260128');
  check('Model change switches supported sizes and default',await run(`document.querySelector('[aria-label="Seedream çözünürlüğü"]').value==='2K'&&Array.from(document.querySelector('[aria-label="Seedream çözünürlüğü"]').options).some(o=>o.value==='4K')`));
  await field('Seedream modeli',options.model);
  check('Flash does not offer unsupported 4K',await run(`!Array.from(document.querySelector('[aria-label="Seedream çözünürlüğü"]').options).some(o=>o.value==='4K')`));
  await field('Poster türü','sale');
  await field('Posterde kullanılacak metin','İndirim\nŞimdi Keşfet');
  await field('Görsel isteği','Ürünüm için krem renkli premium bir kampanya posteri');
  await field('Çıktı oranı','portrait');
  await click('API isteğini önizle · ücretsiz');
  check('Preview prepares actual API prompt without a network request',posts===0&&await run(`document.querySelector('.byteplus-preview').open&&document.querySelector('.byteplus-preview pre').textContent.includes('İndirim')`));
  await run(`document.querySelector('[aria-label="API önizlemesini kapat"]').click()`);
  await click('ModelArk API anahtarı ekle');
  await fs.writeFile(path.join(root,'artifacts/connection-settings-byteplus.png'),(await win.webContents.capturePage()).toPNG());
  const modalBounds=await run('(()=>{const r=document.querySelector(".studio-connection-dialog").getBoundingClientRect();return {x:Math.floor(r.x)-12,y:Math.floor(r.y)-12,width:Math.ceil(r.width)+24,height:Math.ceil(r.height)+24}})()');
  await fs.writeFile(path.join(root,'artifacts/connection-settings-preview.png'),(await win.webContents.capturePage(modalBounds)).toPNG());
  check('Connection dialog is compact with an aligned close button',await run(`(()=>{const d=document.querySelector('.studio-connection-dialog').getBoundingClientRect(),h=document.querySelector('.connection-header').getBoundingClientRect(),b=document.querySelector('.connection-close').getBoundingClientRect();return d.width<=522&&d.height<650&&b.right>h.right-70&&Math.abs(b.top-h.top)<40})()`));
  await run(`Array.from(document.querySelectorAll('.connection-provider-switch button')).find(b=>b.textContent.includes('Gemini')).click()`);
  await delay(100);
  check('Provider switch shows only its own key form',await run(`!!document.querySelector('[aria-label="Gemini API anahtarı"]')&&!document.querySelector('[aria-label="ModelArk API anahtarı"]')`));
  await fs.writeFile(path.join(root,'artifacts/connection-settings-gemini.png'),(await win.webContents.capturePage()).toPNG());
  await run(`Array.from(document.querySelectorAll('.connection-provider-switch button')).find(b=>b.textContent.includes('Codex')).click()`);
  await delay(100);
  check('Codex panel has no unnecessary API key input',await run(`!!document.querySelector('.connection-codex-state')&&!document.querySelector('.connection-key-input')`));
  await run(`Array.from(document.querySelectorAll('.connection-provider-switch button')).find(b=>b.textContent.includes('BytePlus')).click()`);
  await delay(100);
  win.setSize(1000,620);
  await delay(180);
  check('Dialog and footer fit a short desktop window',await run(`(()=>{const d=document.querySelector('.studio-connection-dialog').getBoundingClientRect(),f=document.querySelector('.connection-footer').getBoundingClientRect();return d.top>=15&&d.bottom<=innerHeight-15&&f.bottom<=d.bottom&&d.left>=15&&d.right<=innerWidth-15})()`));
  await fs.writeFile(path.join(root,'artifacts/connection-settings-small.png'),(await win.webContents.capturePage()).toPNG());
  win.setSize(1180,820);
  await delay(100);
  await field('ModelArk API anahtarı','fake-modelark-key-test-only');
  await click('ModelArk anahtarını kaydet');
  await wait(()=>run(`document.querySelector('.byteplus-connection [role="status"]').textContent.includes('kaydedildi')`));
  check('Saving API key never starts generation',posts===0);
  await click('Tamam');
  await fs.writeFile(path.join(root,'artifacts/byteplus-create-screen.png'),(await win.webContents.capturePage()).toPNG());
  check('API controls fit without horizontal overflow',await run('document.querySelector(".byteplus-controls").scrollWidth<=document.querySelector(".byteplus-controls").clientWidth+1'));
  check('Poster copy field uses readable dark-theme styling',await run('getComputedStyle(document.querySelector(".byteplus-copy textarea")).backgroundColor==="rgb(24, 23, 31)"'));
  await field('BytePlus harcama sınırı USD',0.01);
  await run(`document.querySelector('.image-ai-generate').click()`);
  await wait(()=>run(`document.querySelector('.image-ai-status').textContent.includes('sınırı')`));
  check('Main process enforces budget before sending paid request',posts===0&&chats===0);
  await field('BytePlus harcama sınırı USD',1);
  await run(`(()=>{const b=document.querySelector('.image-ai-generate');b.click();b.click();})()`);
  await wait(()=>run('document.querySelectorAll(".creative-result").length===1'));
  check('Double click sends exactly one POST and saves to gallery',posts===1&&downloads===1);
  check('The prompt writer runs once before Seedream with the default text model',chats===1&&lastChat.model==='dola-seed-2-1-turbo-260628'&&lastChat.messages[0].content.includes(JSON.stringify('İndirim\nŞimdi Keşfet')));
  check('Request includes poster guidance, Turkish copy, ratio and no secret in body',lastBody.prompt.includes('promotional poster')&&lastBody.prompt.includes('Şimdi Keşfet')&&!lastBody.prompt.includes('Saygıyla')&&lastBody.prompt.includes('1080:1350')&&!JSON.stringify(lastBody).includes('fake-modelark-key-test-only')&&lastHeaders.Authorization==='Bearer fake-modelark-key-test-only');
  check('Seedream gets the prepared prompt',lastBody.prompt.includes('PREPARED IMAGE PROMPT')&&lastBody.prompt.includes('calm black commemorative poster'));
  // With the copy field empty, the writer's copy is what Seedream renders, and it is shown to the user.
  const backToCreate=async()=>{await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Oluştur')).click()`);await wait(()=>run('!!document.querySelector(".image-ai-generate")'));};
  await backToCreate();
  await field('Posterde kullanılacak metin','');
  await run(`document.querySelector('.image-ai-generate').click()`);
  await wait(()=>run('document.querySelectorAll(".creative-result").length===2'));
  check('Without own copy, Seedream renders the copy the writer wrote',chats===2&&posts===2&&lastBody.prompt.includes('EXACT VISIBLE COPY')&&lastBody.prompt.includes('Saygıyla anıyoruz.'));
  check('The writer warning is shown on the gallery card',await run(`document.querySelector('.creative-writer-warning')?.textContent.includes('Gerçek fotoğraf')`));
  await run(`document.querySelector('.creative-image-open').click()`);
  await wait(()=>run('!!document.querySelector(".creative-written-copy")'));
  check('The written copy is kept with the image',await run(`document.querySelector('.creative-written-copy').textContent.includes('Saygıyla anıyoruz.')`));
  await fs.writeFile(path.join(root,'artifacts/byteplus-writer-result.png'),(await win.webContents.capturePage()).toPNG());
  const ledger=await run('window.electronAPI.byteplusLedger()');
  const writers=ledger.jobs.filter(j=>j.writer);
  check('Usage and completed recovery record retained locally, writer cost from its tokens',ledger.jobs.find(j=>!j.writer).state==='complete'&&writers.length===2&&writers.every(j=>Math.abs(j.estimatedCostUSD-0.0035)<1e-6&&!j.canRecover)&&Math.abs(ledger.reservedUSD-0.043)<1e-6);
  await run(`document.querySelector('[aria-label="Önizlemeyi kapat"]').click()`);
  await delay(200);
  await backToCreate();
  await field('Prompt yazarı','off');
  await run(`document.querySelector('.image-ai-generate').click()`);
  await wait(()=>run('document.querySelectorAll(".creative-result").length===3'));
  check('With the writer off, the request goes straight to Seedream',chats===2&&posts===3&&!lastBody.prompt.includes('PREPARED IMAGE PROMPT'));
  const imageJob=ledger.jobs.find(j=>!j.writer);
  const recovered=await run(`window.electronAPI.byteplusRecover(${JSON.stringify(imageJob.id)})`);
  check('Recovery returns saved image without API or download calls',recovered.success&&recovered.actualWidth===320&&posts===3&&downloads===3);
  await fs.writeFile(path.join(root,'artifacts/byteplus-gallery-screen.png'),(await win.webContents.capturePage()).toPNG());
  const duplicate={...request(),requestId:imageJob.id};
  const duplicateResult=await run(`window.electronAPI.imageStudioRun(${JSON.stringify(duplicate)})`);
  check('Persistent request ID blocks duplicate submission',!duplicateResult.success&&posts===3);
  nextStatus=403;
  const rejected=await run(`window.electronAPI.imageStudioRun(${JSON.stringify(request())})`);
  check('Access rejection is redacted and not retried',!rejected.success&&!rejected.error.includes('do-not-display-secret')&&posts===4);
  nextStatus=200;downloadFails=true;
  const failedDownload=await run(`window.electronAPI.imageStudioRun(${JSON.stringify(request())})`);
  const received=(await run('window.electronAPI.byteplusLedger()')).jobs.find(j=>j.state==='received');
  check('Download failure retains receipt without restarting generation',!failedDownload.success&&received?.canRecover&&posts===5);
  downloadFails=false;
  const retry=await run(`window.electronAPI.byteplusRecover(${JSON.stringify(received.id)})`);
  check('Retry downloads existing output without another billable POST',retry.success&&posts===5);
  await win.webContents.reload();
  await wait(()=>run('!!document.querySelector(".studio-mode-choice")'));
  await run(`document.querySelectorAll('.studio-mode-choice button')[1].click()`);
  await wait(()=>run('!!document.querySelector(".creative-studio")'));
  check('Gallery and local usage survive reload',await run(`document.querySelectorAll('.creative-result').length===3`)&&Math.abs((await run('window.electronAPI.byteplusLedger()')).reservedUSD-0.079)<1e-6);
  await run('window.electronAPI.byteplusClearKey()');
  check('API key can be removed',!(await run('window.electronAPI.byteplusKeyStatus()')).configured);
  await fs.writeFile(path.join(root,'artifacts/byteplus-desktop-report.json'),JSON.stringify({checks,posts,downloads,chats,note:'All HTTP requests mocked. Isolated userData; no paid request or real credentials.'},null,2));
  app.exit(0);
})().catch(async e=>{
  console.error(e);
  if(win&&!win.isDestroyed()) { console.error(await run('document.body.innerText')); await fs.writeFile(path.join(root,'artifacts/byteplus-desktop-failure.png'),(await win.webContents.capturePage()).toPNG()); }
  await fs.writeFile(path.join(root,'artifacts/byteplus-desktop-report.json'),JSON.stringify({checks,error:String(e),posts,downloads},null,2));
  app.exit(1);
});
