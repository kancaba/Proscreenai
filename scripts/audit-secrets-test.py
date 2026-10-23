#!/usr/bin/env python3
"""Exercise audit history + candidate-tree detection in disposable local repositories."""
from pathlib import Path
import json, subprocess, tempfile, unittest
SCANNER=Path(__file__).with_name('audit-secrets.py').resolve()
class AuditTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='pro-screen-ai-audit-');self.root=Path(self.temp.name)
  self.git('init','-q','-b','main');self.git('config','user.name','Audit Fixture');self.git('config','user.email','audit@example.invalid')
  (self.root/'README.md').write_text('Synthetic audit fixture.\n');self.commit()
 def tearDown(self):self.temp.cleanup()
 def git(self,*args):return subprocess.run(['git',*args],cwd=self.root,check=True,capture_output=True)
 def commit(self):self.git('add','.');self.git('commit','-qm','Synthetic fixture')
 def scan(self):
  r=subprocess.run(['python3',str(SCANNER)],cwd=self.root,capture_output=True,text=True)
  return r.returncode,json.loads(r.stdout)
 def test_clean_source_and_environment_placeholder(self):
  (self.root/'workflow.yml').write_text('url: "https://x-access-token:${GH_TOKEN}@github.com/example/example.git"\n');self.commit()
  code,report=self.scan();self.assertEqual(code,0);self.assertEqual(report['findings'],[])
 def test_historical_secret_is_detected_after_removal(self):
  synthetic='fig'+'d_'+'X'*36
  file=self.root/'config.json';file.write_text(json.dumps({'credential':synthetic}));self.commit();file.unlink();self.commit()
  code,report=self.scan();self.assertEqual(code,1)
  self.assertTrue(any(f['path']=='config.json' and f['object']!='working-tree' for f in report['findings']))
  self.assertNotIn(synthetic,json.dumps(report))
 def test_new_uncommitted_credential_is_detected_without_echoing_it(self):
  synthetic='modelion'+'-vk-'+'x'*36
  (self.root/'settings.json').write_text(json.dumps({'credential':synthetic}))
  code,report=self.scan();self.assertEqual(code,1)
  self.assertTrue(any(f['object']=='working-tree' for f in report['findings']))
  self.assertNotIn(synthetic,json.dumps(report))
if __name__=='__main__':unittest.main()
