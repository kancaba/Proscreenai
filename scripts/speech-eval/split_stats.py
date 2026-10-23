import json, re, sys
truth=json.load(open(sys.argv[2])); res=json.load(open(sys.argv[1]))
def norm(s):
    s=s.replace('I','ı').replace('İ','i').lower(); return re.findall(r"[\wçğıöşü']+", s)
words=[{'t':t,'s':w.get('startMs'),'e':w.get('endMs')} for w in res['words'] for t in norm(w['text'])]
S=[];E=[]
for sent in truth['sentences']:
    f=norm(sent['firstWord'])[0]; l=norm(sent['lastWord'])[0]
    st=[w['s']-sent['startMs'] for w in words if w['t']==f and w['s'] is not None and abs(w['s']-sent['startMs'])<2000]
    en=[w['e']-sent['endMs'] for w in words if w['t']==l and w['e'] is not None and abs(w['e']-sent['endMs'])<2000]
    if st: S.append(min(st,key=abs))
    if en: E.append(min(en,key=abs))
def stats(name,v):
    v=sorted(v); a=[abs(x) for x in v]
    print(f"{name}: n={len(v)} median {v[len(v)//2]:+d} ms, p90 |err| {sorted(a)[int(len(a)*0.9)]} ms, max {max(a)} ms, ≤150 ms {sum(x<=150 for x in a)}/{len(a)}")
stats('sentence start',S); stats('sentence end',E)
