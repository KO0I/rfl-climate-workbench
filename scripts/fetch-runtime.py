"""Fetch the pinned LLVM runtime source subset into the directory argument."""
import urllib.request,tarfile,pathlib,sys
url='https://codeload.github.com/r-wasm/llvm-project/tar.gz/e3da0a873ea32bca563c2cccdd4d7622b13cef50'
root=pathlib.Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
with urllib.request.urlopen(url,timeout=60) as r,tarfile.open(fileobj=r,mode='r|gz') as t:
 for m in t:
  parts=m.name.split('/',1)
  if len(parts)<2:continue
  path=parts[1]
  if path.startswith(('flang/include/','flang/lib/Decimal/','flang-rt/','llvm/include/')):
   m.name=path;t.extract(m,root,filter='data')
print('Runtime sources extracted')
