"""Build with r-wasm/flang-wasm v21.1.8 and its Emscripten installation.
Usage: python3 scripts/build-wasm.py /absolute/toolchain/opt
EM_CONFIG must point to an Emscripten configuration for that toolchain.
"""
from pathlib import Path
import argparse,subprocess,sys,os
parser=argparse.ArgumentParser()
parser.add_argument('toolchain')
parser.add_argument('--link-only',action='store_true')
options=parser.parse_args()
root=Path(__file__).resolve().parents[1];tool=Path(options.toolchain).resolve()
build=root/'.build'/'low'
engine='engine.js'
flang=tool/'flang/host/bin/flang';emcc=tool/'emsdk/upstream/emscripten/emcc.py'
if not os.environ.get('EXO_FORTRAN_RUNTIME'):raise SystemExit('Set EXO_FORTRAN_RUNTIME to the descriptor-compatible runtime built with scripts/build-runtime.py.')
if not options.link_only: subprocess.run([sys.executable,str(root/'scripts/prepare-model.py')],check=True)
os.environ['EXO_FLANG']=str(flang);os.environ['EXO_EMCC']=str(emcc)
fc=f'{sys.executable} {root / "scripts/flang-wasm.py"}'
if not options.link_only: subprocess.run(['make','-C',str(build),'-B','-j4',f'MOST_F90={fc}',f'MOST_CC={sys.executable} {emcc}','MOST_LINK=true'],check=True)
# Only objects in the upstream target's expanded link recipe are linked.
recipe=subprocess.check_output(['make','-s','-n','-C',str(build),f'MOST_F90={fc}',f'MOST_CC={sys.executable} {emcc}','MOST_LINK=PRINT_OBJECTS'],text=True)
objects=next(x.split()[1:] for x in recipe.splitlines() if x.startswith('PRINT_OBJECTS '))
# Keep the T21 allocation and guard every stack-pointer update.
args=[sys.executable,str(emcc),str(root/'scripts/runtime-abi.c'),*[str(build/f) for f in objects],os.environ['EXO_FORTRAN_RUNTIME'],'-O2','-g3','-Wl,--fatal-warnings','-sMODULARIZE=1','-sEXPORT_NAME=createExoPlaSim','-sEXPORTED_FUNCTIONS=["_browser_init","_browser_step","_browser_fields","_browser_flush","_browser_nlat","_malloc","_free"]','-sEXPORTED_RUNTIME_METHODS=["FS","HEAPF32"]','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=67108864','-sSTACK_SIZE=8388608','-sSTACK_OVERFLOW_CHECK=2','-sMAXIMUM_MEMORY=536870912','-sENVIRONMENT=web,worker,node','-sFORCE_FILESYSTEM=1','--no-entry','--preload-file',str(root/'model/data')+'@/model','-o',str(root/'dist'/engine)]
subprocess.run(args,check=True)
print('ExoPlaSim WebAssembly build complete')
