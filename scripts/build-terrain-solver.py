"""Build the unchanged C99 Terrain Solver and its browser ABI with Emscripten.
Usage: python3 scripts/build-terrain-solver.py [path/to/emcc]
"""
from pathlib import Path
import shutil, subprocess, sys

root = Path(__file__).resolve().parents[1]
emcc = sys.argv[1] if len(sys.argv) > 1 else shutil.which('emcc')
if not emcc:
    raise SystemExit('Install Emscripten or pass the path to emcc.')
core = root / 'model/terrain-solver'
compiler = [sys.executable, emcc] if emcc.endswith('.py') else [emcc]
subprocess.run([*compiler, '-std=c99', '-O2', '-ffp-contract=off', '-Wall', '-Wextra', '-Werror',
    '-I' + str(core / 'include'), str(core / 'src/cubeterrain.c'), str(core / 'src/browser.c'),
    '-lm', '--no-entry', '-sMODULARIZE=1', '-sEXPORT_NAME=createTerrainSolver',
    '-sENVIRONMENT=worker,node', '-sALLOW_MEMORY_GROWTH=1', '-sINITIAL_MEMORY=16777216',
    '-sMAXIMUM_MEMORY=134217728', '-sTOTAL_STACK=1048576', '-sSTACK_OVERFLOW_CHECK=2',
    '-sFILESYSTEM=0', '-sEXPORTED_FUNCTIONS=["_ts_configure","_ts_set","_ts_build","_ts_sample","_ts_stats","_ts_config","_ts_error","_ts_destroy"]',
    '-sEXPORTED_RUNTIME_METHODS=["ccall","UTF8ToString"]',
    '-o', str(root / 'dist/terrain-solver-engine.js')], check=True)
