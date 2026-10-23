import json, re, subprocess, sys, time
src, out = sys.argv[1], sys.argv[2]
MAX_MS = 30000
log = subprocess.run(['ffmpeg','-hide_banner','-i',src,'-af','silencedetect=noise=-40dB:d=0.4','-f','null','-'],capture_output=True,text=True).stderr
starts=[float(x)*1000 for x in re.findall(r'silence_start: ([\d.]+)',log)]
ends=[float(x)*1000 for x in re.findall(r'silence_end: ([\d.]+)',log)]
total=float(re.search(r'Duration: (\d+):(\d+):([\d.]+)',log).group(3))*1000+int(re.search(r'Duration: (\d+):(\d+)',log).group(2))*60000
cuts=[(s+e)/2 for s,e in zip(starts,ends)]
chunks=[]; begin=0.0; last_cut=None
for c in cuts+[total]:
    if c-begin>MAX_MS and last_cut and last_cut>begin:
        chunks.append((begin,last_cut)); begin=last_cut
    last_cut=c
chunks.append((begin,total))
words=[]; t0=time.time()
for i,(a,b) in enumerate(chunks):
    subprocess.run(['ffmpeg','-loglevel','error','-y','-ss',f'{a/1000:.3f}','-to',f'{b/1000:.3f}','-i',src,'-ac','1','-ar','16000',f'chunk{i}.wav'],check=True)
    r=json.loads(subprocess.run(['./transcribe',f'chunk{i}.wav','tr-TR'],capture_output=True,text=True,check=True).stdout)
    for w in r['words']:
        if 'startMs' in w: w['startMs']+=round(a); w['endMs']+=round(a)
        words.append(w)
json.dump({'elapsedMs':int((time.time()-t0)*1000),'chunks':len(chunks),'words':words},open(out,'w'),ensure_ascii=False)
print(len(chunks),'chunks')
