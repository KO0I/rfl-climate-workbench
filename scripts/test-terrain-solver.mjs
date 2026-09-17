import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import '../dist/terrain.js';
import '../dist/terrain-solver-data.js';
import {solverDefaults,solverPreset} from '../dist/terrain-solver.js';

const dist=new URL('../dist/',import.meta.url),core=fileURLToPath(new URL('../model/terrain-solver/',import.meta.url));
const factory=createRequire(import.meta.url)('../dist/terrain-solver-engine.js');
const wasmBinary=await readFile(new URL('terrain-solver-engine.wasm',dist));
const model=await factory({wasmBinary,print:()=>{},printErr:()=>{}});
function configure(settings,seed){
 assert.equal(model.ccall('ts_configure','number',['string'],[settings.preset]),1);
 for(const [key,value] of Object.entries({...settings,seed}))if(key!=='preset')assert.equal(model.ccall('ts_set','number',['string','string'],[key,String(value)]),1);
 assert.equal(model._ts_build(),1,model.UTF8ToString(model._ts_error()));
}

test('browser Wasm samples agree with the original C99 core',async()=>{
 const dir=await mkdtemp(tmpdir()+'/terrain-solver-');
 try{
  await writeFile(dir+'/probe.c',`#include "cubeterrain.h"
#include <stdio.h>
#include <string.h>
int main(int argc,char **argv){ct_config c;char error[512];ct_world *w;ct_config_preset(&c,argv[1]);
for(int i=2;i<argc;i++){char *eq=strchr(argv[i],'=');if(!eq)return 2;*eq=0;if(!ct_config_set(&c,argv[i],eq+1,error,sizeof(error)))return 3;}
w=ct_world_build(&c,NULL,NULL,error,sizeof(error));if(!w){fprintf(stderr,"%s",error);return 4;}
for(int i=0;i<64;i++){ct_sample s;ct_world_sample(w,(ct_vec3){i%9-4.25,(i/9)%7-3.25,1.125+i%5},&s);
printf("%.17g %.17g %u %u %u %.17g\\n",s.height_m,s.water_m,s.is_water,s.biome,s.palette_index,s.moisture);}ct_world_destroy(w);return 0;}`);
  execFileSync('cc',['-std=c99','-O2','-ffp-contract=off','-I'+core+'include',dir+'/probe.c',core+'src/cubeterrain.c','-lm','-o',dir+'/probe']);
  for(const preset of ['balanced','regional']){
   const settings=solverPreset(preset),seed=42;
   const args=[preset,...Object.entries({...settings,seed}).filter(([key])=>key!=='preset').map(([key,value])=>key+'='+value)];
   const native=execFileSync(dir+'/probe',args,{encoding:'utf8'}).trim().split('\n').map(line=>line.split(' ').map(Number));
   configure(settings,seed);
   for(let i=0;i<64;i++){
    const ptr=model._ts_sample(i%9-4.25,Math.floor(i/9)%7-3.25,1.125+i%5),s=model.HEAPF64.slice(ptr/8,ptr/8+7);
    for(const k of [0,1])assert.ok(Math.abs(s[k]-native[i][k])<1e-6,`${preset}, sample ${i}, height ${k}`);
    for(const k of [2,3,4])assert.equal(s[k],native[i][k]);
    assert.ok(Math.abs(s[6]-native[i][5])<1e-12);
   }
   model._ts_destroy();
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('all presets yield finite repeatable terrain with fitted slope constraints and original climate dimensions',()=>{
 let baseline;
 for(const preset of ['balanced','archipelago','alpine','regional']){
  const settings=solverPreset(preset),result=TerrainSolverData.generate(model,settings,42);
  assert.equal(result.low.width,64);assert.equal(result.low.rows,32);assert.equal(result.high.width,128);assert.equal(result.high.rows,64);
  for(const [overview,width,rows] of [[result.overviewLow,128,64],[result.overviewHigh,256,128]]){
   assert.equal(overview.width,width);assert.equal(overview.rows,rows);
   assert.equal(overview.elevation.length,width*rows);
   assert.ok(overview.elevation.every(v=>Number.isFinite(v)&&v>=0));
  }
  assert.ok(result.stats.max_macro_slope_excess_m<1e-6);
  assert.equal(result.config.seed,'42');assert.equal(result.config.macro_resolution,settings.macro_resolution);
  for(const grid of [result.low,result.high]){
   assert.ok(grid.land.some(v=>v===0)&&grid.land.some(v=>v===1));
   assert.ok(grid.height.every(Number.isFinite));assert.ok(grid.elevation.every(v=>Number.isFinite(v)&&v>=0));
   assert.ok(grid.indices.every(v=>v>=0&&v<15));
   assert.ok(Math.abs(grid.weights.reduce((a,b)=>a+b)-2)<1e-12);
  }
  const boundary=ExoTerrain.boundaryFromTerrain(result.low);
  const mask=boundary.files['N032_surf_0172.sra'].trim().split(/\s+/).slice(8).map(Number);
  const geopotential=boundary.files['N032_surf_0129.sra'].trim().split(/\s+/).slice(8).map(Number);
  assert.deepEqual(mask,Array.from(result.low.land));
  geopotential.forEach((v,i)=>{const expected=result.low.elevation[i]*9.80665;assert.ok(Math.abs(v-expected)<Math.max(.0001,Math.abs(expected)*1e-7),'Geopotential agrees within Float32 precision.');});
  if(preset==='balanced')baseline=result;
 }
 assert.deepEqual(TerrainSolverData.generate(model,solverDefaults,42),baseline);
 assert.notDeepEqual(TerrainSolverData.generate(model,solverDefaults,43).low.land,baseline.low.land);
 assert.ok(model.HEAPF64.buffer.byteLength<=134217728);
 assert.throws(()=>TerrainSolverData.generate(model,{...solverDefaults,max_macro_slope:-1},42),/max_macro_slope/);
 assert.throws(()=>ExoTerrain.boundaryFromTerrain({...baseline.low,elevation:new Float32Array(2048).fill(NaN)}),/invalid/);
});

test('the actual worker compiles, solves and transfers arrays without network requests',async()=>{
 const names=['terrain.js','terrain-solver-engine.js','terrain-solver-data.js','terrain-solver-worker.js'];
 const source=(await Promise.all(names.map(name=>readFile(new URL(name,dist),'utf8')))).join('\n;\n');
 let result;
 const sandbox={WebAssembly,ArrayBuffer,Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,TextDecoder,TextEncoder,console,
  location:{href:'blob:https://climate.example/terrain'},setTimeout,clearTimeout,
  fetch:()=>{throw new Error('No worker network access.');},importScripts:()=>{throw new Error('No worker script requests.');},
  postMessage:(data,transfer=[])=>{const received=structuredClone(data,{transfer});if(received.type==='error')throw new Error(received.message);if(received.type==='result')result=received.result;}
 };
 sandbox.self=sandbox;vm.runInContext(source,vm.createContext(sandbox));
 await sandbox.onmessage({data:{settings:solverDefaults,seed:0,wasmBinary:Uint8Array.from(wasmBinary).buffer}});
 assert.equal(result.low.elevation.length,2048);assert.equal(result.config.seed,'0');assert.ok(result.low.elevation.some(v=>v>100));
});
