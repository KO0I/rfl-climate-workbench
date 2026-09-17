import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {loadClimateEngine,errorMessage} from '../dist/engine-loader.js';
import '../dist/terrain.js';
import '../dist/terrain-solver-data.js';
import {solverDefaults} from '../dist/terrain-solver.js';

const dist=new URL('../dist/',import.meta.url);
const config={flux:1367,co2:360,rotation:1,days:10};
const names=['terrain.js','model-config.js','engine.js','worker.js','engine.wasm','engine.data'];
const files=Object.fromEntries(await Promise.all(names.map(async name=>[name,await readFile(new URL(name,dist))])));
// Feature-detection stub only; the numerical test uses its own isolated context.
globalThis.Worker=class Worker {};

function mockDownloads(t,override){
 const requests=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  const name=new URL(url).pathname.split('/').at(-1);requests.push({name,options});
  const response=override?.(name,options);
  return response||new Response(files[name],{headers:{'content-type':name.endsWith('.js')?'text/javascript':'application/octet-stream'}});
 });
 return requests;
}

for(const preset of ['low','high'])test(preset+': page downloads the original solver through the session',async t=>{
 const stem=globalThis.ExoConfig.resolution(preset).engine;assert.equal(stem,'engine');
 const requests=mockDownloads(t);
 const signal=new AbortController().signal;
 const assets=await loadClimateEngine(signal,preset);
 try{
  assert.equal(requests.length,6);
  assert.deepEqual(requests.filter(r=>r.name.startsWith('engine')).map(r=>r.name).sort(),[stem+'.data',stem+'.js',stem+'.wasm'].sort());
  assert.ok(requests.every(r=>r.options.credentials==='same-origin'&&r.options.signal===signal));
  assert.equal(assets.wasmBinary.byteLength,files[stem+'.wasm'].length);
  assert.equal(assets.modelData.byteLength,files[stem+'.data'].length);
  t.mock.restoreAll();
  const source=await (await fetch(assets.workerURL)).text();
  assert.ok(source.includes("post('booted')"));
  assert.ok(!source.includes("importScripts('"));
 }finally{URL.revokeObjectURL(assets.workerURL);}
});

test('protected, missing, login-page and damaged engine responses fail with actionable errors',async t=>{
 const cases=[
  {response:()=>new Response('',{status:401}),message:/session/},
  {response:()=>new Response('',{status:404}),message:/engine.wasm \(HTTP 404\)/},
  {response:()=>new Response('<html>Sign in</html>',{headers:{'content-type':'text/html'}}),message:/web page/},
  {response:()=>new Response('not wasm'),message:/damaged/}
 ];
 for(const item of cases){
  mockDownloads(t,name=>name==='engine.wasm'?item.response():null);
  await assert.rejects(loadClimateEngine(new AbortController().signal),item.message);
  t.mock.restoreAll();
 }
});

test('cancelled loading never creates a worker URL; error events without a message have a useful fallback',async t=>{
 const controller=new AbortController();
 mockDownloads(t,()=>{controller.abort();});
 const create=t.mock.method(URL,'createObjectURL',()=>{throw new Error('Must not create a worker URL');});
 await assert.rejects(loadClimateEngine(controller.signal),{name:'AbortError'});
 assert.equal(create.mock.callCount(),0);
 for(const value of [{type:'error'},undefined,null,'undefined',''])assert.equal(errorMessage(value,'Useful error.'),'Useful error.');
 assert.equal(errorMessage(new Error('Out of memory')),'Out of memory');
});

test('worker rejects a mismatched solver before writing a differently sized output buffer',async()=>{
 const messages=[];
 const sandbox={ArrayBuffer,Uint8Array,ExoConfig:globalThis.ExoConfig,clearTimeout(){},addEventListener(){},
  postMessage:message=>messages.push(message),createExoPlaSim:async()=>({_browser_nlat:()=>64})};
 sandbox.self=sandbox;vm.runInContext(files['worker.js'].toString(),vm.createContext(sandbox));
 await sandbox.onmessage({data:{type:'start',resolution:'high',config,wasmBinary:new ArrayBuffer(8),modelData:new ArrayBuffer(8)}});
 assert.equal(messages.at(-1).type,'error');assert.match(messages.at(-1).message,/does not match/);
 assert.ok(!messages.some(message=>message.type==='frame'||message.type==='ready'));
});

for(const [label,runConfig,terrainConfig,preset='low',useTerrainSolver=false] of [
 ['default ten-day run',config],
 ['cold random boundary',{flux:1050,co2:400,rotation:0.8,days:1}],
 ['warm random boundary',{flux:1500,co2:300,rotation:3,days:1}],
 ['RFL continents, ten days',config,{seed:0,sea:.45,frequency:3,relief:3000}],
 ['RFL changed seed and high relief',{flux:1367,co2:360,rotation:1,days:1},{seed:2468,sea:.48,frequency:2.3,relief:5000}],
 ['High display with the original T21 solver',{flux:1367,co2:360,rotation:1,days:1},{seed:0,sea:.45,frequency:3,relief:3000},'high'],
 ['Terrain Solver, one day',{flux:1367,co2:360,rotation:1,days:1},null,'low',true]
])test(`real bundled model: ${label}, finite fields and pause/resume without worker networking`,{timeout:300000},async()=>{
 const grid=globalThis.ExoConfig.resolution(preset),n=grid.cells,stem=grid.engine,stepsPerDay=1440/grid.timestepMinutes;
 let generatedTerrain=null;
 if(useTerrainSolver){
  const factory=createRequire(import.meta.url)('../dist/terrain-solver-engine.js');
  const solver=await factory({wasmBinary:await readFile(new URL('terrain-solver-engine.wasm',dist)),print:()=>{},printErr:()=>{}});
  generatedTerrain=TerrainSolverData.generate(solver,solverDefaults,42).low;
 }
 let complete,failed,lastFrame,pausedStep,pausedAt,frames=0;
 const done=new Promise((resolve,reject)=>{complete=resolve;failed=reject;});
 const timers=new Set(),events=new Map();
 const later=(fn,delay)=>{const timer=setTimeout(()=>{timers.delete(timer);fn();},delay);timers.add(timer);return timer;};
 const sandbox={WebAssembly,ArrayBuffer,Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,BigInt64Array,BigUint64Array,TextDecoder,TextEncoder,URL,console,performance,
  location:{href:'blob:https://climate.example/engine',pathname:'/engine'},WorkerGlobalScope:function(){},
  setTimeout:later,clearTimeout:id=>{clearTimeout(id);timers.delete(id);},
  fetch:()=>{throw new Error('Worker network access is unavailable');},
  importScripts:()=>{throw new Error('Worker script requests are unavailable');},
  addEventListener:(name,fn)=>events.set(name,fn),
  postMessage:(message,transfer=[])=>{
   const data=structuredClone(message,{transfer});
   if(data.type==='status')console.log(label+': '+data.message);
   if(data.type==='error')failed(new Error(data.message+'\n'+data.log));
   if(data.type==='frame'){
    lastFrame=data;frames++;
    if(frames===1)console.log(label+': first output at step '+data.steps);
    assert.ok(data.fields.slice(0,7*n).every(Number.isFinite));
    if(!pausedStep&&data.steps>=12){pausedStep=data.steps;later(()=>sandbox.onmessage({data:{type:'pause'}}),0);}
    else if(pausedAt)assert.equal(data.steps,pausedAt);
   }
   if(data.type==='paused'){
    pausedAt=lastFrame.steps;
    later(()=>{assert.equal(lastFrame.steps,pausedAt);pausedAt=0;sandbox.onmessage({data:{type:'resume'}});},25);
   }
   if(data.type==='complete')complete();
  }
 };
 sandbox.self=sandbox;
 const context=vm.createContext(sandbox);
 try{
  const source=['terrain.js','model-config.js',stem+'.js','worker.js'].map(name=>files[name].toString()).join('\n;\n');
  vm.runInContext(source,context,{filename:'climate-worker.js'});
  const wasmBinary=Uint8Array.from(files[stem+'.wasm']).buffer,modelData=Uint8Array.from(files[stem+'.data']).buffer;
  const start=structuredClone({type:'start',resolution:preset,config:runConfig,terrain:terrainConfig,terrainGrid:generatedTerrain,wasmBinary,modelData},{transfer:[wasmBinary,modelData]});
  assert.equal(wasmBinary.byteLength,0);
  await sandbox.onmessage({data:start});
  await done;
  assert.equal(lastFrame.steps,runConfig.days*stepsPerDay);assert.equal(lastFrame.target,runConfig.days*stepsPerDay);assert.equal(lastFrame.dt,grid.timestepMinutes*60);
  assert.equal(lastFrame.grid.longitude,grid.longitude);assert.equal(lastFrame.grid.latitude,grid.latitude);assert.equal(lastFrame.fields.length,7*n+2*grid.latitude+4);
  assert.ok(pausedStep);assert.ok(frames>1);
  if(terrainConfig||generatedTerrain){
   const terrain=generatedTerrain||sandbox.ExoTerrain.generate(terrainConfig,grid.longitude);
   assert.deepEqual(Array.from(lastFrame.fields.slice(5*n,6*n)),Array.from(terrain.land));
   for(let y=0;y<grid.latitude;y++)assert.ok(Math.abs(lastFrame.fields[7*n+y]-terrain.sinLat[y])<1e-7);
   assert.ok(Math.max(...terrain.elevation)>300);
   const pressure=lastFrame.fields.slice(4*n,5*n),elevation=terrain.elevation;
   const em=elevation.reduce((a,b)=>a+b)/n,pm=pressure.reduce((a,b)=>a+b)/n;
   let covariance=0,ev=0,pv=0;
   for(let i=0;i<n;i++){const e=elevation[i]-em,p=pressure[i]-pm;covariance+=e*p;ev+=e*e;pv+=p*p;}
   const correlation=covariance/Math.sqrt(ev*pv);
   assert.ok(correlation<-.4,'Elevated terrain must reduce actual surface pressure: '+correlation);
   console.log('Elevation / surface-pressure correlation:',correlation.toFixed(3));
   console.log('Verified exact RFL land mask and Gaussian coordinates in actual Fortran output.');
  }
  assert.ok(Math.min(...lastFrame.fields.slice(0,n))>200);
  assert.ok(Math.max(...lastFrame.fields.slice(0,n))<330);
  console.log(`Completed ${lastFrame.steps} steps with ${frames} finite field updates and pause/resume; no worker downloads.`);
 }finally{for(const timer of timers)clearTimeout(timer);}
});
