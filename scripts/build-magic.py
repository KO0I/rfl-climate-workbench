"""Build the serial MagIC Fortran solver with the existing flang-wasm toolchain.

Usage: EM_CONFIG=... EXO_FORTRAN_RUNTIME=... python3 scripts/build-magic.py TOOLCHAIN_OPT
The upstream model/magic/src files are preserved. Browser changes are applied only
to .build/magic: one callable entrypoint, a fixed namelist path, and yielding/output
callbacks. The upstream numerical routines and built-in transforms are retained.
"""
from pathlib import Path
import os, sys, subprocess, re

root = Path(__file__).resolve().parents[1]
tool = Path(sys.argv[1]).resolve()
build = root / '.build/magic'
build.mkdir(parents=True, exist_ok=True)
flang = tool / 'flang/host/bin/flang'
emcc = tool / 'emsdk/upstream/emscripten/emcc.py'
env = dict(os.environ, EXO_FLANG=str(flang), EXO_EMCC=str(emcc))
contents={p.name:p.read_text() for p in (root/'model/magic/src').iterdir() if p.is_file()}

def patch(name, old, new):
    s=contents[name]
    if old not in s: raise RuntimeError('Missing patch anchor: '+name)
    contents[name]=s.replace(old,new,1)

patch('magic.f90', 'program magic\n', 'subroutine browser_run() bind(c)\n')
patch('magic.f90', 'end program magic', 'end subroutine browser_run')
patch('Namelists.f90', 'argument_count = command_argument_count()', 'argument_count = 1 ! Browser uses a fixed local input file')
patch('Namelists.f90', 'call get_command_argument(1,input_filename)', "input_filename = 'input.nml'")
patch('step_time.f90', 'outer: do n_time_step=1,n_time_steps_go', 'outer: do n_time_step=1,n_time_steps_go\n         call magic_tick(n_time_step)')
patch('out_graph_file.f90', 'close(n_graph_file)', 'close(n_graph_file)\n         call magic_graph_ready()')
patch('parallel.f90','   use omp_lib','   ! Serial browser build: OpenMP calls are excluded by WITHOMP')
for name,s in contents.items():
    if name.endswith('.f90'):s=re.sub(r'^\s*use omp_lib\s*$', '   ! OpenMP module unused in the serial build', s, flags=re.M|re.I)
    p=build/name
    if not p.exists() or p.read_text()!=s:p.write_text(s)
# Resolve module dependencies from the selected serial sources. The upstream
# hand-written Makefile includes obsolete cyclic dependencies.
excluded={'shtns.f90','algebra_lapack.f90','fft_fftw.f90','dct_fftw.f90'}
sources=sorted(p for p in build.glob('*.f90') if p.name not in excluded)
flags=['-O2','-cpp','-DWITH_PRECOND_S','-DWITH_PRECOND_Z','-DWITH_PRECOND_BJ',
       '-DWITH_PRECOND_Z10','-Dsngl=1','-Ddble=2','-DDEFAULT_PRECISION=dble',
       '-DDEFAULT_OUTPUT_PRECISION=sngl','-DGIT_VERSION="0d408831fd38ac72c52d53dd091a3ccaabce5207"','-I.']
texts={p:subprocess.check_output([str(flang),'-E',*flags,p.name],cwd=build,text=True) for p in sources}
modules={m.lower():p for p,s in texts.items() for m in re.findall(r'^\s*module\s+(\w+)\s*$',s,re.M|re.I)}
make=['all: '+' '.join(p.stem+'.o' for p in sources),'']
import shlex
for p,s in texts.items():
    deps={modules[m.lower()] for m in re.findall(r'^\s*use(?:\s*,[^:]+::)?\s+(\w+)',s,re.M|re.I) if m.lower() in modules}
    deps.discard(p)
    make += [p.stem+'.o: '+p.name+' '+str(root/'scripts/magic-flang.py')+' '+' '.join(d.stem+'.o' for d in sorted(deps)),
        '\t@'+shlex.join([sys.executable,str(root/'scripts/magic-flang.py'),'-c',*flags,p.name,'-o',p.stem+'.o']),
        '\t@echo Compiled '+p.name, '']
(build/'Makefile').write_text('\n'.join(make))
args=['make','-j4']
subprocess.run(args,cwd=build,env=env,check=True)
objects=[str(p.with_suffix('.o')) for p in sources]
args=[sys.executable,str(emcc),*objects,str(root/'scripts/runtime-abi.c'),
      str(root/'scripts/magic-browser.c'),os.environ['EXO_FORTRAN_RUNTIME'],
      '-O2','-Wl,--fatal-warnings','-sMODULARIZE=1','-sEXPORT_NAME=createMagIC',
      '-sEXPORTED_FUNCTIONS=["_browser_run"]','-sEXPORTED_RUNTIME_METHODS=["FS","ccall"]',
      '-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=67108864','-sMAXIMUM_MEMORY=536870912',
      '-sSTACK_SIZE=8388608','-sSTACK_OVERFLOW_CHECK=2','-sASYNCIFY=1',
      '-sASYNCIFY_ONLY=["browser_run","_QMstep_time_modPstep_time","magic_tick_"]',
      '-sASYNCIFY_STACK_SIZE=1048576','-sENVIRONMENT=web,worker,node',
      '-sFORCE_FILESYSTEM=1','--no-entry','-o',str(root/'dist/magic-engine.js')]
subprocess.run(args,cwd=build,env=env,check=True)
print('MagIC WebAssembly build complete')
