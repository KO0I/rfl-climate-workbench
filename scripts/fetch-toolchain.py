"""Extract the public flang-wasm v21.1.8 toolchain into the directory argument.
Downloads approximately 720 MiB. Does not install system packages.
"""
import urllib.request,json,tarfile,pathlib,sys,os
base='https://ghcr.io'; repo='r-wasm/flang-wasm'
t=json.load(urllib.request.urlopen(base+'/token?scope=repository:'+repo+':pull',timeout=30))['token']
def req(path):
 return urllib.request.urlopen(urllib.request.Request(base+path,headers={'Authorization':'Bearer '+t,'Accept':'application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json'}),timeout=60)
def manifest(ref): return json.load(req('/v2/'+repo+'/manifests/'+ref))
m=manifest('v21.1.8')
if 'manifests' in m:m=manifest(next(v['digest'] for v in m['manifests'] if v['platform']['architecture']=='amd64'))
pathlib.Path(sys.argv[1]).mkdir(parents=True,exist_ok=True)
print('Layers:',[(v['digest'],round(v['size']/1024/1024,1)) for v in m['layers']],flush=True)
for layer in m['layers']:
 print('Fetching layer',layer['digest'],flush=True)
 with req('/v2/'+repo+'/blobs/'+layer['digest']) as response:
  with tarfile.open(fileobj=response,mode='r|gz') as archive:
   for member in archive:
    n=member.name.lstrip('./')
    if n.startswith(('opt/flang/','opt/emsdk/upstream/emscripten/','opt/emsdk/upstream/bin/','opt/emsdk/upstream/lib/')):
     archive.extract(member,sys.argv[1],filter='data')
 print('Layer finished',flush=True)
print('DONE',flush=True)

root=pathlib.Path(sys.argv[1])
for p in [root/'opt/flang/host/bin/flang',*(root/'opt/emsdk/upstream/bin').iterdir()]:
 if p.is_file():p.chmod(p.stat().st_mode|0o111)
