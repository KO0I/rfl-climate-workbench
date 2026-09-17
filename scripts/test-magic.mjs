import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,writeFile} from 'node:fs/promises';
import '../dist/magic-model.js';

const base=new URL('../dist/',import.meta.url);
export async function runMagic(config,{pause=false,save=false}={}){
 const source=(await Promise.all(['magic-model.js','magic-engine.js','magic-worker.js'].map(n=>readFile(new URL(n,base),'utf8')))).join('\n;\n');
 const wasmBinary=Uint8Array.from(await readFile(new URL('magic-engine.wasm',base))).buffer;
 const frames=[];let done=false,failure=null,paused=false,pauseChecked=false,completedLog='';
 const timers=new Set();
 const later=(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);fn();},ms);timers.add(id);return id;};
 const sandbox={WebAssembly,ArrayBuffer,Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,BigInt64Array,BigUint64Array,TextDecoder,TextEncoder,DataView,console,performance,
  setTimeout:later,clearTimeout:id=>{clearTimeout(id);timers.delete(id);},
  fetch(){throw new Error('Workers must not fetch protected assets.');},importScripts(){throw new Error('Workers must not load scripts.');},
  postMessage(message,transfer=[]){
   const d=structuredClone(message,{transfer});
   if(d.type==='frame')frames.push(d.frame);
   if(d.type==='progress'&&pause&&!paused&&d.step>=20){
    paused=true;sandbox.onmessage({data:{type:'pause',paused:true}});
    const count=frames.length;
    later(()=>{assert.equal(frames.length,count,'paused solver must hold its fields');pauseChecked=true;sandbox.onmessage({data:{type:'pause',paused:false}});},60);
   }
   if(d.type==='error'){failure=new Error(d.message+'\n'+d.log);}
   if(d.type==='complete'){done=true;completedLog=d.log;}
  }};
 sandbox.self=sandbox;
 vm.runInContext(source,vm.createContext(sandbox),{filename:'magic-worker-bundle.js'});
 const start=performance.now();
 try{
  await sandbox.onmessage({data:{type:'start',config,wasmBinary}});
  if(failure)throw failure;
  assert.ok(done,'must finish normally');if(frames.length<2)await writeFile(new URL('../.build/magic-diagnostic.log',import.meta.url),completedLog);assert.ok(frames.length>1,'frames: '+frames.length+'\n'+completedLog);
  for(const f of frames){assert.ok(f.fields.every(Number.isFinite));assert.equal(f.width,config.resolution||GasMagic.defaults.resolution);assert.equal(f.rows,f.width/2);assert.equal(f.levels,f.width===128?17:25);assert.ok(f.time>=0);}
  const last=frames.at(-1);assert.equal(last.step,config.steps);
  assert.ok(last.time>frames[0].time);assert.notDeepEqual(last.fields,frames[0].fields);
  const shell=GasMagic.shell(last,2);assert.ok(shell.east.some(v=>Math.abs(v)>1e-9),'nonzero circulation');
  const surface=GasMagic.shell(last,0);assert.ok(Math.max(...surface.radial.map(Math.abs))<1e-5,'impermeable boundary');
  if(pause)assert.ok(pauseChecked);
  console.log(`MagIC: ${last.width} × ${last.rows} × ${last.levels}, ${config.steps} steps, ${frames.length} frames, ${(performance.now()-start).toFixed(0)} ms, time ${last.time}; retained field data ${(frames.reduce((n,f)=>n+f.fields.byteLength,0)/1048576).toFixed(1)} MiB`);
  if(save){await writeFile(new URL('../.build/magic-example.json',import.meta.url),JSON.stringify(last,(_,v)=>ArrayBuffer.isView(v)?Array.from(v):v));await writeFile(new URL('../.build/magic-example.log',import.meta.url),completedLog);}
  return frames;
 }finally{for(const id of timers)clearTimeout(id);}
}

test('physical controls are bounded and produce explicit dimensionless MagIC namelists',()=>{
 assert.match(GasMagic.namelist(GasMagic.defaults),/mode=1/);
 assert.match(GasMagic.namelist(GasMagic.defaults),/n_r_max=17, n_cheb_max=15, n_phi_tot=128/);
 assert.match(GasMagic.namelist({...GasMagic.defaults,resolution:192}),/n_r_max=25, n_cheb_max=23, n_phi_tot=192/);
 for(const bad of [{ek:0},{ra:Infinity},{strat:6},{steps:NaN},{resolution:64},{resolution:256},{steps:100.5}])assert.throws(()=>GasMagic.validate({...GasMagic.defaults,...bad}));
 assert.throws(()=>GasMagic.parseGraph(new Uint8Array(4)),/header/);
});
test('actual MagIC worker: default 1000-step run, finite evolving fields and pause/resume',async()=>{await runMagic({...GasMagic.defaults,steps:1000},{pause:true,save:true});});
test('actual MagIC worker: finer grid with deep density stratification',async()=>{await runMagic({...GasMagic.defaults,steps:1000,resolution:192,strat:5,radratio:.35,ra:148638.035,perturbation:.01});});
