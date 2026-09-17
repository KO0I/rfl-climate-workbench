"""Build the descriptor-compatible Flang runtime for this port.
Usage: EM_CONFIG=... python3 scripts/build-runtime.py TOOLCHAIN_OPT LLVM_SOURCE OUTPUT
LLVM_SOURCE must contain the pinned flang/, flang-rt/, and llvm/include/ trees.
The source header is patched in place. OUTPUT should be a fresh directory.
"""
from pathlib import Path
import subprocess,sys,concurrent.futures
if len(sys.argv)!=4:raise SystemExit(__doc__)
tool,src,build=[Path(x).resolve() for x in sys.argv[1:]]
build.mkdir(parents=True,exist_ok=True)
p=src/'flang/include/flang/ISO_Fortran_binding.h';s=p.read_text()
s=s.replace('typedef ptrdiff_t CFI_index_t;','typedef long long CFI_index_t;')
s=s.replace('size_t elem_len; /* element size in bytes */','unsigned long long elem_len; /* Flang Wasm descriptor uses i64 */')
assert 'typedef long long CFI_index_t;' in s and 'unsigned long long elem_len;' in s
p.write_text(s)
(build/'config.h').write_text('#ifndef FORTRAN_RUNTIME_CONFIG_H\n#define FORTRAN_RUNTIME_CONFIG_H\n#define HAVE_STRERROR_R 1\n#define HAVE_DECL_STRERROR_S 0\n#endif\n')
emcc=tool/'emsdk/upstream/emscripten/em++.py'
flags=['-O2','-std=c++17','-fno-exceptions','-fno-rtti',f'-I{build}',f'-I{src}/flang/include',f'-I{src}/flang-rt/include',f'-I{src}/llvm/include','-DFLANG_LITTLE_ENDIAN','-fPIC','-Wno-c++11-narrowing','-fvisibility=hidden','-DFE_UNDERFLOW=0','-DFE_OVERFLOW=0','-DFE_INEXACT=0','-DFE_INVALID=0','-DFE_DIVBYZERO=0','-DFE_ALL_EXCEPT=0']
sources=sorted((src/'flang-rt/lib/runtime').glob('*.cpp'))+[src/'flang/lib/Decimal/decimal-to-binary.cpp',src/'flang/lib/Decimal/binary-to-decimal.cpp']
def compile(p):
 out=build/(p.stem+'.o')
 r=subprocess.run([sys.executable,str(emcc),*flags,'-c',str(p),'-o',str(out)],capture_output=True,text=True)
 if r.returncode:raise RuntimeError(p.name+'\n'+r.stdout+r.stderr)
 return str(out)
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:objects=list(ex.map(compile,sources))
lib=build/'libFortranRuntime.a'
if lib.exists():lib.unlink()
subprocess.run([str(tool/'emsdk/upstream/bin/llvm-ar'),'rcs',str(lib),*objects],check=True)
print('Built descriptor-compatible runtime:',lib)
