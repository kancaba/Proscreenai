// Isolated production UI + real MediaRecorder. Seed exits without recorder.stop().
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),artifacts=path.join(root,'artifacts'),mode=process.argv[2]||'seed';
app.setPath('userData',path.join(artifacts,'recording-recovery-profile')); app.setName('ScreenMovie Recording Recovery Test'); app.getAppPath=()=>root;
const delay=ms=>new Promise(r=>setTimeout(r,ms)); async function wait(fn){for(let i=0;i<600;i++){const v=await fn();if(v)return v;await delay(100)}throw Error('Recovery test timed out')}
let win;const run=s=>win.webContents.executeJavaScript(s,true);function check(name,pass){console.log(pass?'PASS':'FAIL',name);if(!pass)throw Error(name)}
(async()=>{await import(pathToFileURL(path.join(root,'dist-electron/main.js')).href);await app.whenReady();win=await wait(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('welcome')));await wait(()=>run('!!window.electronAPI'));
if(mode==='seed'){
 await run(`(async()=>{
  const session=await window.electronAPI.beginRecordingStream();if(!session.success)throw Error(session.message);
  window.captureTest={id:session.id,ack:0,error:null};const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const context=canvas.getContext('2d');let frame=0;
  window.captureTimer=setInterval(()=>{context.fillStyle=frame++%2?'#6954ff':'#10243d';context.fillRect(0,0,640,360);context.fillStyle='white';context.font='40px sans-serif';context.fillText('Recovery '+frame,40,170)},33);
  const audio=new AudioContext();await audio.resume();const tone=audio.createOscillator(),gain=audio.createGain(),dest=audio.createMediaStreamDestination();gain.gain.value=.02;tone.connect(gain);gain.connect(dest);tone.start();window.captureAudio=audio;
  const stream=canvas.captureStream(30);dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));let pending=Promise.resolve(),sequence=0;
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9,opus'});window.captureRecorder=recorder;
  recorder.ondataavailable=e=>{if(!e.data.size)return;const index=sequence++;pending=pending.then(async()=>{const result=await window.electronAPI.appendRecordingStream(session.id,index,await e.data.arrayBuffer());if(!result.success)throw Error(result.message);window.captureTest.ack++}).catch(e=>{window.captureTest.error=String(e)})};recorder.start(1000);
 })()`);
 await wait(()=>run('window.captureTest.error || window.captureTest.ack >= 5'));
 check('Real video and audio chunks acknowledged on disk',await run('!window.captureTest.error && window.captureTest.ack >= 5'));
 check('Active recording excluded from recovery list',(await run('window.electronAPI.listRecordingRecovery()')).length===0);
 console.log('KILL recording process without stopping MediaRecorder');process.kill(process.pid,'SIGKILL');
}else{
 await wait(()=>run(`document.body.innerText.includes('Yarım kalan kayıtlar')`));
 const entries=await run('window.electronAPI.listRecordingRecovery()');check('Interrupted recording offered after restart',entries.length===1 && entries[0].bytes>0);
 await fs.writeFile(path.join(artifacts,'recording-recovery-welcome.png'),(await win.webContents.capturePage()).toPNG());
 await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Kaydı kurtar').click()`);
 win=await wait(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('editor')));await wait(()=>run("document.querySelector('video')?.readyState>=2"));
 check('Recovered video plays in editor',await run("document.querySelector('video').duration >= 4 && document.querySelector('video').videoWidth === 640"));
 const result=await run('window.electronAPI.getCurrentVideoPath()');const file=result.path || result.videoPath;
 const ffmpeg=require('ffmpeg-static');let probe='';try{execFileSync(ffmpeg,['-hide_banner','-i',file],{stdio:'pipe'})}catch(e){probe=e.stderr.toString()}
 check('Recovered MP4 contains AAC audio',probe.includes('Audio: aac'));
 check('Successful recovery clears interrupted list',(await run('window.electronAPI.listRecordingRecovery()')).length===0);
 const mediaFiles=await fs.readdir(path.join(artifacts,'recording-recovery-profile/recovery/recordings'));check('Raw recording retained',mediaFiles.some(f=>f.endsWith('.webm')));
 await fs.writeFile(path.join(artifacts,'recording-recovery-editor.png'),(await win.webContents.capturePage()).toPNG());app.exit(0);
}
})().catch(async e=>{console.error(e);if(win&&!win.isDestroyed())console.error(await run('document.body.innerText'));app.exit(1)});
