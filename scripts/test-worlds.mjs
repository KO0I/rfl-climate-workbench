import test from 'node:test';
import assert from 'node:assert/strict';
import {atmospheres,worlds,climateSupport,canSimulate,randomWorld,randomProfiles,validateRandomWorld,randomCO2Bounds} from '../dist/world-catalog.js';
import {surfaceProfiles,defaultSurfaceConfig,estimateSurface,surfacePlausibility,validateSurfaceConfig} from '../dist/surface-model.js';

test('capability matrix distinguishes real climate, surface estimates and appearance-only combinations',()=>{
 let climate=0,surface=0;
 for(const w of Object.keys(worlds))for(const a of Object.keys(atmospheres)){
  const s=climateSupport(w,a);
  if(s.mode==='exoplasim'){climate++;assert.ok(canSimulate(w,a));}
  else if(s.mode==='surface-estimate'){surface++;assert.ok(surfaceProfiles[w].atmospheres.includes(a));assert.ok(!canSimulate(w,a));}
  else assert.equal(s.supported,false);
 }
 assert.equal(climate,3);assert.equal(surface,9);
 assert.equal(climateSupport('ice','oxygen').supported,false);
 assert.equal(climateSupport('temperate','water').supported,false);
});

test('5,000 seeded random worlds obey probabilities, coupled constraints and field availability',()=>{
 let seed=90417;const rng=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32),counts={};
 for(let i=0;i<5000;i++){
  const days=[1,10,30,360][i%4],r=randomWorld(Object.keys(worlds)[i%8],days,rng);
  counts[r.planet]=(counts[r.planet]||0)+1;
  assert.ok(climateSupport(r.planet,r.atmosphere).supported);
  if(r.mode==='exoplasim'){
   assert.equal(r.config.days,days);assert.equal(r.atmosphere,'nitrogen');
   const [lo,hi]=randomCO2Bounds(r.config.flux);assert.ok(r.config.co2>=lo&&r.config.co2<=hi);
  }else{
   const e=estimateSurface(r.planet,r.atmosphere,r.config);
   assert.equal(surfacePlausibility(r.planet,r.atmosphere,e),null);
   assert.ok(e.fields.slice(6*2048,7*2048).every(v=>Number.isFinite(v)&&v>0));
   assert.ok(e.fields.slice(4*2048,5*2048).every(v=>Number.isFinite(v)&&v>=0));
   assert.deepEqual(e.availableFields,['temperature','pressure']);
   assert.ok(e.fields.slice(0,4*2048).every(Number.isNaN),'Unmodeled air temperature, wind and clouds must never masquerade as zero fields.');
   assert.ok(Math.abs(e.statistics.mean_input_w_m2-e.statistics.mean_outgoing_w_m2)/e.statistics.mean_input_w_m2<1e-10);
  }
 }
 for(const [p,rule] of Object.entries(randomProfiles))assert.ok(Math.abs(counts[p]/50-rule.weight)<2,`${p}: ${counts[p]} samples`);
 console.log('Class counts in 5,000 draws:',counts);
});

test('every extreme reference is viable; endpoints and bounded rejection fallback terminate with valid worlds',()=>{
 for(const [p,rule] of Object.entries(surfaceProfiles))for(const a of rule.atmospheres){
  const e=estimateSurface(p,a,defaultSurfaceConfig(p,a));assert.equal(surfacePlausibility(p,a,e),null);
 }
 let cumulative=0;
 for(const [p,rule] of Object.entries(randomProfiles)){
  const first=(cumulative+rule.weight/2)/100;cumulative+=rule.weight;
  for(const edge of [0,1]){let n=0;const r=randomWorld('temperate',30,()=>n++===0?first:edge);assert.equal(r.planet,p);assert.doesNotThrow(()=>validateRandomWorld(r));assert.ok(n<400);}
 }
 for(const invalid of [-1,NaN,Infinity,1.1])assert.throws(()=>randomWorld('temperate',10,()=>invalid));
 assert.throws(()=>randomWorld('temperate',7));
});

test('energy response, gas constraints and airless pressure have the intended physical direction',()=>{
 const a=estimateSurface('ice','none',{flux:40,pressure:0,albedo:0.7,rotation:20});
 const b=estimateSurface('ice','none',{flux:80,pressure:0,albedo:0.7,rotation:20});
 assert.ok(b.statistics.mean>a.statistics.mean);assert.ok(a.fields.slice(4*2048,5*2048).every(v=>v===0));
 const v=defaultSurfaceConfig('venus','co2');assert.ok(estimateSurface('venus','co2',{...v,pressure:150}).statistics.mean>estimateSurface('venus','co2',v).statistics.mean);
 assert.throws(()=>validateSurfaceConfig('ice','none',{flux:70,pressure:1,albedo:0.7,rotation:20}));
 assert.throws(()=>validateSurfaceConfig('silicate','silicate',{flux:900000,pressure:0.01,albedo:0.12,rotation:0.7}));
 assert.throws(()=>validateRandomWorld({planet:'warm',atmosphere:'nitrogen',config:{flux:1500,co2:900,rotation:1,days:10}}));
 const frozenSteam=estimateSurface('steam','water',{flux:3000,pressure:5,albedo:0.55,rotation:20});assert.match(surfacePlausibility('steam','water',frozenSteam),/650 K/);
 const frozenGas=estimateSurface('volatile','nitrogen',{flux:12,pressure:2.5,albedo:0.5,rotation:30});assert.match(surfacePlausibility('volatile','nitrogen',frozenGas),/condense/);
});

test('high display resolution keeps extreme estimates on the original grid',()=>{
 let seed=2804;const rng=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
 for(let i=0;i<250;i++){
  const result=randomWorld('temperate',10,rng,'high');
  assert.doesNotThrow(()=>validateRandomWorld(result,'high'));
  if(result.mode!=='surface-estimate')continue;
  const e=estimateSurface(result.planet,result.atmosphere,result.config,'high'),n=e.grid.cells;
  assert.equal(e.grid.longitude,64);assert.equal(e.grid.latitude,32);assert.equal(n,2048);
  assert.equal(e.fields.length,7*n+68);assert.equal(surfacePlausibility(result.planet,result.atmosphere,e),null);
  assert.ok(e.fields.slice(6*n,7*n).every(v=>Number.isFinite(v)&&v>0));
  assert.ok(e.fields.slice(4*n,5*n).every(v=>Number.isFinite(v)&&v>=0));
  assert.ok(Math.abs(e.statistics.mean_input_w_m2-e.statistics.mean_outgoing_w_m2)/e.statistics.mean_input_w_m2<1e-10);
 }
});
