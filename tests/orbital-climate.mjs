import assert from 'node:assert/strict';
import {createClimate,advance,summarize} from '../dist/orbital-climate-core.js';
for(const options of [{},{flux:600,emissivity:1,ocean:0,mixing:3},{flux:2000,emissivity:.4,ocean:1,mixing:3}]){
 const s=createClimate(options);advance(s,9600);assert(s.T.every(Number.isFinite));
}
const cool=createClimate({emissivity:1}),warm=createClimate({emissivity:.4});advance(cool,2400);advance(warm,2400);assert(summarize(warm).mean>summarize(cool).mean);
const uniform=createClimate({flux:0,ocean:1});advance(uniform,10);assert(Math.max(...uniform.T)-Math.min(...uniform.T)<1e-10);
console.log('Passed: 200-day extreme runs, greenhouse response, uniform-field boundaries.');
const ocean=createClimate({ocean:1}),land=createClimate({ocean:0});
assert(ocean.cloud.some(v=>v>0),'Moist initial clouds visible on opening');
advance(ocean,480);advance(land,480);
const cover=s=>s.cloud.reduce((a,b)=>a+b,0)/s.cloud.length;
assert(cover(ocean)>cover(land),'Ocean evaporation sustains more clouds than dry land');
for(const s of [ocean,land]){assert(s.cloud.every(v=>Number.isFinite(v)&&v>=0&&v<=1));assert(s.moisture.every(v=>Number.isFinite(v)&&v>=0));}
console.log('Passed: initial cloud visibility, ocean moisture response, bounded cloud coverage.');
