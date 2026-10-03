"""Package complete current project, excluding dependencies and git internals."""
from pathlib import Path
import zipfile,sys,subprocess
root=Path(__file__).resolve().parents[1]
output=Path(sys.argv[1]) if len(sys.argv)>1 else root.parent/'vocabulary-app.zip'
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
 for p in root.rglob('*'):
  if p.is_file() and not any(x in p.relative_to(root).parts for x in ['node_modules','.git']) and p.suffix!='.zip': z.write(p,'vocabulary-app/'+str(p.relative_to(root)))
print(output)
