#!/usr/bin/env python3
"""Read-only credential scan. Reports locations, never credential values.
Default: HEAD and origin/main. --all-refs also audits local legacy/checkpoint refs.
Heuristic evidence, not a guarantee that an unknown credential format is absent.
"""
import argparse, json, re, subprocess, sys
p=argparse.ArgumentParser();p.add_argument('--all-refs',action='store_true');args=p.parse_args()
def git(*a):return subprocess.check_output(['git',*a],stderr=subprocess.PIPE)
patterns={
 'Figma token':r'fig[dpu]_[A-Za-z0-9_-]{20,}',
 'GitHub token':r'(?:gh[pousr]_[A-Za-z0-9_]{25,}|github_pat_[A-Za-z0-9_]{30,})',
 'Google API key':r'(?:AIza[A-Za-z0-9_-]{30,}|AQ\.[A-Za-z0-9_-]{40,})',
 'Provider key':r'(?:modelion-vk-[A-Za-z0-9_-]{15,}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{30,})',
 'AWS access ID':r'(?:AKIA|ASIA)[A-Z0-9]{16}',
 'Slack token':r'xox[baprs]-[A-Za-z0-9-]{20,}',
 'Private key':r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
 'JWT':r'eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
 'Credential in URL':r'https?://[^\s/:"<>]{2,}:[^\s/@"<>${}]{8,}@',
 'Literal credential':r'''(?i)(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[=:]\s*["']([A-Za-z0-9_./+-]{28,})["']''',
}
compiled={k:re.compile(v) for k,v in patterns.items()}
refs=['HEAD']
try:git('rev-parse','--verify','origin/main');refs.append('origin/main')
except subprocess.CalledProcessError:pass
if args.all_refs:refs=git('for-each-ref','--format=%(refname)').decode().splitlines()+['HEAD']
objects={}
for line in git('rev-list','--objects',*refs).decode().splitlines():
 parts=line.split(' ',1)
 if len(parts)==2:objects.setdefault(parts[0],parts[1])
proc=subprocess.Popen(['git','cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE)
findings=[];text_count=0;binary_count=0
for oid,name in objects.items():
 proc.stdin.write((oid+'\n').encode());proc.stdin.flush()
 header=proc.stdout.readline().decode().split()
 size=int(header[2]);data=proc.stdout.read(size);proc.stdout.read(1)
 if header[1]!='blob':continue
 if b'\0' in data[:8192]:binary_count+=1;continue
 try:text=data.decode('utf-8')
 except UnicodeError:binary_count+=1;continue
 text_count+=1
 for number,line in enumerate(text.splitlines(),1):
  for label,pattern in compiled.items():
   if pattern.search(line):findings.append({'kind':label,'object':oid,'path':name,'line':number})
proc.stdin.close();proc.wait()
# Include the current candidate source tree so an uncommitted new credential cannot pass.
from pathlib import Path
candidate_paths=sorted(set(git('ls-files','--cached','--others','--exclude-standard').decode().splitlines()))
worktree_text=0
for name in candidate_paths:
 path=Path(name)
 if not path.is_file():continue
 data=path.read_bytes()
 if b'\0' in data[:8192]:continue
 try:text=data.decode('utf-8')
 except UnicodeError:continue
 worktree_text+=1
 for number,line in enumerate(text.splitlines(),1):
  for label,pattern in compiled.items():
   if pattern.search(line):findings.append({'kind':label,'object':'working-tree','path':name,'line':number})
print(json.dumps({'scope':'all local refs' if args.all_refs else 'published/deployable history',
 'refs':refs,'commits':int(git('rev-list','--count',*refs).decode()),
 'text_blobs_scanned':text_count,'candidate_text_files_scanned':worktree_text,'binary_blobs_not_text_scanned':binary_count,'findings':findings,
 'limitation':'Pattern-based scan; unknown formats and text embedded in images/binaries need manual review.'},ensure_ascii=False,indent=2))
sys.exit(1 if findings else 0)
