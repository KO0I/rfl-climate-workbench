"""MagIC-specific wasm32 fixes for flang-wasm 21's host-sized C pointer tables.
Retain the eight-byte ABI slot, with a 32-bit relocatable pointer plus zero padding.
Ordinary Fortran REAL/INTEGER/COMPLEX numerical types are untouched.
"""
import os,sys,subprocess,tempfile,pathlib,re
args=sys.argv[1:];src=next(x for x in args if x.endswith('.f90'))
out=args[args.index('-o')+1]
filtered=[x for x in args if x!='-c'];i=filtered.index('-o');del filtered[i:i+2]
with tempfile.TemporaryDirectory() as d:
 ll=pathlib.Path(d)/'module.ll'
 subprocess.run([os.environ['EXO_FLANG'],'-g','-S','-emit-llvm',*filtered,'-o',str(ll)],check=True)
 s=ll.read_text()
 for a,b in {'_FortranASystemClockCount':'exo_clock_count','_FortranAioOutputInteger64':'exo_output_integer64','_FortranAioInquireLogical':'exo_inquire_logical','_FortranASystemClockCountRate':'magic_clock_rate','_FortranASystemClockCountMax':'magic_clock_max','_FortranAAllocatableSetBounds':'magic_alloc_bounds','_FortranAPointerSetBounds':'magic_pointer_bounds'}.items():s=s.replace('@'+a+'(', '@'+b+'(')
 # An equivalent aggregate permits wasm32 table relocations in static initializers.
 for kind in ['__builtin_c_funptr','__builtin_c_ptr']:
  typ='%_QM__fortran_builtinsT'+kind
  s=s.replace(typ+' = type { i64 }',typ+' = type { ptr, i32, [0 x i64] }')
  s=re.sub(re.escape(typ)+r' \{ i64 ptrtoint \(ptr (@[^ ]+) to i64\) \}',lambda m:typ+' { ptr '+m[1]+', i32 0, [0 x i64] zeroinitializer }',s)
  s=s.replace(typ+' { i64 0 }',typ+' zeroinitializer')
 ll.write_text(s);pathlib.Path(src).with_suffix('.ll').write_text(s)
 subprocess.run([sys.executable,os.environ['EXO_EMCC'],'-g','-c','-O2',str(ll),'-o',out],check=True)
