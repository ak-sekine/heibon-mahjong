"""Run existing Chromium scenarios without replacing historical screenshots.
Start Vite on port 4173, then run this file from the repository root.
Optional arguments select individual browser-* scripts (without .py).
"""
import pathlib,re,sys
names=sys.argv[1:] or ['browser-step13-4','browser-call-viewport','browser-action-controls','browser-riichi','browser-cpu-riichi']
for name in names:
 if name not in ['browser-step13-4','browser-call-viewport','browser-action-controls','browser-riichi','browser-cpu-riichi']:
  raise ValueError(name)
 source=pathlib.Path('tests',name+'.py').read_text()
 source=re.sub(r"out\s*=\s*pathlib.Path\('[^']+'\)","out=pathlib.Path('docs/screenshots/step13.5/regression/"+name+"')",source)
 print('Running '+name,flush=True)
 exec(compile(source,'tests/'+name+'.py','exec'),{'__name__':'__main__'})
