const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),artifacts=path.join(root,'artifacts');
fs.rmSync(path.join(artifacts,'recording-recovery-profile'),{recursive:true,force:true});
const electron=require('electron');
for(const mode of ['seed','recover']){
 const result=spawnSync(electron,[path.join(__dirname,'recording-recovery-test.cjs'),mode],{cwd:root,encoding:'utf8',timeout:80000});
 process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
 if(mode==='seed'&&result.signal==='SIGKILL')continue;
 if(result.status!==0){console.error('Recovery test failed',mode,result.status,result.signal);process.exit(1)}
 if(mode==='seed'){console.error('Seed did not simulate crash');process.exit(1)}
}
console.log('PASS live recording → SIGKILL → restart → video and audio recovery');
