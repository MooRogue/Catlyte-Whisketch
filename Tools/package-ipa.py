#!/usr/bin/env python3
"""Package an already signed .app and verify its actual extracted signature."""
from pathlib import Path
import argparse,subprocess,tempfile,shutil,zipfile,plistlib,os
p=argparse.ArgumentParser();p.add_argument('app',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
app=a.app.resolve();out=a.output.resolve();assert app.is_dir() and app.suffix=='.app';assert not out.exists()
info=plistlib.loads((app/'Info.plist').read_bytes());executable=info['CFBundleExecutable'];assert os.access(app/executable,os.X_OK)
subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
with tempfile.TemporaryDirectory(prefix='whisketch-ipa-') as tmp:
 root=Path(tmp);(root/'Payload').mkdir();shutil.copytree(app,root/'Payload'/app.name)
 subprocess.run(['zip','-qry','-X',str(out),'Payload','-x','*/._*','*/.DS_Store','__MACOSX/*'],cwd=root,check=True)
 with zipfile.ZipFile(out) as z:
  assert z.testzip() is None
  assert all(not Path(n).name.startswith('._') and '__MACOSX' not in n for n in z.namelist())
  assert (z.getinfo('Payload/'+app.name+'/'+executable).external_attr>>16)&0o111
 subprocess.run(['unzip','-q',str(out),'-d',str(root/'verify')],check=True)
 assert os.access(root/'verify/Payload'/app.name/executable,os.X_OK)
 subprocess.run(['codesign','--verify','--deep','--strict',str(root/'verify/Payload'/app.name)],check=True)
print(out)
