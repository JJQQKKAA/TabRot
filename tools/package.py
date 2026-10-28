"""Package only files consumed by Chrome; no build/runtime dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'manifest.json').read_text())
target = root / 'dist' / f'TabRot-v{manifest["version"]}.zip'
target.parent.mkdir(exist_ok=True)
files = [root / 'manifest.json', *sorted((root / 'src').glob('*')), *sorted((root / 'icons').glob('icon-*.png'))]
files = [p for p in files if p.is_file() and p.name != 'icon-master.png']
with ZipFile(target, 'w', ZIP_DEFLATED) as bundle:
    for path in files:
        bundle.write(path, path.relative_to(root))
print(f'{target} ({len(files)} files, {target.stat().st_size:,} bytes)')
