"""Match MagIC's flang-wasm special-binding metadata alignment, then build runtime.
Arguments and environment are the same as build-runtime.py.
"""
from pathlib import Path
import subprocess,sys
src=Path(sys.argv[2])
p=src/'flang-rt/include/flang-rt/runtime/type-info.h'
s=p.read_text()
if 'alignas(8) ProcedurePointer proc_;' not in s:s=s.replace('ProcedurePointer proc_;','alignas(8) ProcedurePointer proc_;')
p.write_text(s)
subprocess.run([sys.executable,str(Path(__file__).with_name('build-runtime.py')),*sys.argv[1:]],check=True)
