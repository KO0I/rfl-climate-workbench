"""Write an Emscripten config for an extracted toolchain directory."""
from pathlib import Path
import sys,shutil
p=Path(sys.argv[1]).resolve();up=p/'opt/emsdk/upstream';node=shutil.which('node')
if not node:raise SystemExit('Node.js must be installed.')
config=p/'emscripten.config'
config.write_text(f'LLVM_ROOT = {str(up/"bin")!r}\nBINARYEN_ROOT = {str(up)!r}\nNODE_JS = [{node!r}]\n')
print(config)
