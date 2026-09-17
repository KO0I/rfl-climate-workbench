import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import '../dist/terrain.js';
import {Playback} from '../dist/playback.js';
import {paletteBmp,paletteXpm,readPaletteBmp,readPaletteXpm} from '../dist/planet-tool/palette.js';
import {cubeFaces,faceDirection,directionToUV,cubeLookup} from '../dist/planet-tool/cubemap.js';
const T=globalThis.ExoTerrain;

test('RFL noise agrees with the original C sampler',async()=>{
 const original=await readFile(new URL('../model/rfl-planet-tool/planet_tool.c',import.meta.url),'utf8');
 const helpers=original.slice(original.indexOf('static float hash3('),original.indexOf('static Uint32 pack('));
 const dir=await mkdtemp(tmpdir()+'/rfl-terrain-');
 try{
  await writeFile(dir+'/sample.c','#include <math.h>\n#include <stdio.h>\nstatic float fracf(float x){return x-floorf(x);}\n'+helpers+'\nint main(){for(int i=0;i<128;i++)printf("%.9g\\n",fbm(i*.125f-8,i*.25f-4,2-i*.0625f));}\n');
  execFileSync('cc',['-std=c99','-O2','-ffp-contract=off',dir+'/sample.c','-lm','-o',dir+'/sample']);
  const values=execFileSync(dir+'/sample',{encoding:'utf8'}).trim().split('\n').map(Number);
  for(let i=0;i<values.length;i++)assert.ok(Math.abs(values[i]-T.fbm(i*.125-8,i*.25-4,2-i*.0625))<1e-7,`C/JS sample ${i}`);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('terrain is deterministic, changes with controls, wraps, and writes real geopotential',()=>{
 const base=T.generate({}),repeat=T.generate({}),next=T.generate({seed:248}),flat=T.generate({relief:0});
 assert.deepEqual(base.land,repeat.land);assert.notDeepEqual(base.land,next.land);assert.ok(flat.elevation.every(v=>v===0));
 assert.ok(base.land.some(v=>v===0)&&base.land.some(v=>v===1));
 for(const lat of [-Math.PI/2,-.3,0,.6,Math.PI/2])assert.ok(Math.abs(T.heightAt(-Math.PI,lat,base.settings)-T.heightAt(Math.PI,lat,base.settings))<1e-6);
 assert.ok(Math.abs(base.weights.reduce((a,b)=>a+b)-2)<1e-12);
 const files=T.boundaryFiles({}).files;
 const values=files['N032_surf_0129.sra'].trim().split(/\s+/).slice(8).map(Number);
 assert.equal(values.length,2048);
 values.forEach((v,i)=>assert.ok(Math.abs(v-base.elevation[i]*9.80665)<.01));
 assert.equal(Object.keys(files).length,14);
 assert.throws(()=>T.validate({seed:-1}));assert.throws(()=>T.validate({relief:NaN}));
});

test('edited palette round-trips through BMP and XPM; malformed palettes fail',()=>{
 const palette=[...T.palette];palette[12]='#02f1ab';palette[4]='#1100ff';
 assert.deepEqual(readPaletteBmp(paletteBmp(palette)),palette);
 assert.deepEqual(readPaletteXpm(paletteXpm(palette)),palette);
 assert.throws(()=>readPaletteBmp(new Uint8Array(5)));
 assert.throws(()=>readPaletteXpm('! XPM2\n400 400 1 1\na c #000000\n'));
 assert.throws(()=>readPaletteXpm(paletteXpm(palette).replace('#02f1ab','None')));
});

test('high resolution doubles both terrain axes and writes matching climate boundaries',()=>{
 const settings={seed:2468},low=T.generate(settings),high=T.generate(settings,128);
 assert.equal(high.width,low.width*2);assert.equal(high.rows,low.rows*2);
 for(const key of ['height','elevation','land','indices'])assert.equal(high[key].length,low[key].length*4);
 assert.equal(high.sinLat.length,64);assert.equal(high.weights.length,64);
 assert.ok(Math.abs(high.weights.reduce((a,b)=>a+b)-2)<1e-12);
 assert.ok(high.elevation.every(Number.isFinite));assert.ok(high.indices.every(i=>i<15));
 for(let y=0;y<high.rows;y++)assert.equal(high.sinLat[y],-high.sinLat[high.rows-1-y]);
 assert.ok(new Set(high.height).size>new Set(low.height).size*3,'High res adds terrain samples in both directions.');
 assert.deepEqual(high.settings,low.settings);
 assert.deepEqual(T.generate(settings,128),high);assert.deepEqual(T.boundaryFiles(settings).terrain,low);
 const boundary=T.boundaryFiles(settings,128);
 assert.deepEqual(boundary.terrain,high);
 for(const [name,text] of Object.entries(boundary.files)){
  assert.match(name,/^N064_surf_/);const values=text.trim().split(/\s+/).map(Number);
  assert.equal(values[4],128);assert.equal(values[5],64);assert.equal(values.length,8192+8);
 }
});

test('replay retains chronology and endpoints within its memory cap',()=>{
 const p=new Playback(40);
 for(let steps=0;steps<5000;steps++)p.push({steps,dt:1800,fields:new Float32Array([steps])});
 assert.ok(p.all.length<=41);assert.equal(p.all[0].steps,0);assert.equal(p.current.steps,4999);
 const count=p.all.length;p.push({steps:4999,dt:1800});assert.equal(p.all.length,count);
 for(let i=1;i<p.all.length;i++)assert.ok(p.all[i].steps>p.all[i-1].steps);
 p.play();assert.equal(p.current.steps,0);assert.ok(p.tick());const held=p.current;p.playing=false;p.tick();assert.equal(p.current,held);
 p.seek(p.all.length-1);assert.equal(p.current.steps,4999);p.play();assert.equal(p.current.steps,0);
 p.live();assert.equal(p.current.steps,4999);assert.equal(p.replaying,false);p.reset();assert.equal(p.current,null);
});

test('all twelve cube edges and eight corners match across their neighboring faces',()=>{
 const key=p=>p.map(v=>v.toFixed(7).replace('-0.0000000','0.0000000')).join(','),edges=new Map(),corners=new Map();
 for(const face of cubeFaces){
  for(const [u,v] of [[-1,-1],[-1,1],[1,-1],[1,1]]){const k=key(faceDirection(face,u,v));corners.set(k,(corners.get(k)||0)+1);}
  for(const [u,v] of [[-1,0],[1,0],[0,-1],[0,1]]){const k=key(faceDirection(face,u,v));edges.set(k,(edges.get(k)||0)+1);}
 }
 assert.equal(corners.size,8);assert.ok([...corners.values()].every(n=>n===3));assert.equal(edges.size,12);assert.ok([...edges.values()].every(n=>n===2));
 for(let i=0;i<=20;i++){
  const t=i/10-1;
  assert.deepEqual(faceDirection('pz',1,t),faceDirection('px',-1,t));
  const a=directionToUV(faceDirection('pz',t,-1)),b=directionToUV(faceDirection('py',t,1));assert.deepEqual(a,b);
 }
 const front=cubeLookup('pz',256,1024,512),east=cubeLookup('px',256,1024,512);
 for(let y=0;y<256;y++)assert.equal(front[y*256+255],east[y*256]);
});
