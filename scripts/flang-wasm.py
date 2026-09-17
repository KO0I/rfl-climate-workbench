#!/usr/bin/env python3
"""Compile using flang-wasm 21; adapt three LP64 runtime declarations to Wasm32.
The wrappers only affect file inquiry and diagnostic integer/clock I/O.
The Fortran numerical operations and data types are not changed.
"""
import os,sys,subprocess,tempfile,pathlib
args=sys.argv[1:];src=next(x for x in args if x.endswith(('.f90','.f')))
out=args[args.index('-o')+1] if '-o' in args else str(pathlib.Path(src).with_suffix('.o'))
filtered=[x for x in args if x!='-c']
if '-o' in filtered:i=filtered.index('-o');del filtered[i:i+2]
with tempfile.TemporaryDirectory() as d:
 ll=pathlib.Path(d)/'module.ll'
 subprocess.run([os.environ['EXO_FLANG'],'-g','-S','-emit-llvm',*filtered,'-o',str(ll)],check=True)
 s=ll.read_text()
 for a,b in {'_FortranASystemClockCount':'exo_clock_count','_FortranAioOutputInteger64':'exo_output_integer64','_FortranAioInquireLogical':'exo_inquire_logical'}.items():s=s.replace('@'+a+'(', '@'+b+'(')
 pathlib.Path(src).with_suffix('.ll').write_text(s)
 ll.write_text(s)
 subprocess.run([sys.executable,os.environ['EXO_EMCC'],'-g','-c','-O2',str(ll),'-o',out],check=True)
