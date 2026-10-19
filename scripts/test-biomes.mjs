import assert from 'node:assert/strict';
import {BIOMES,WATER_BIOME,classifyBiome,generateBiomeLayer,accumulateBiomeClimate} from '../dist/biomes.js';

// All reference legend categories must remain addressable.
assert.equal(BIOMES.length,18);
assert.equal(new Set(BIOMES.map(b=>b.id)).size,18);
assert(BIOMES.every((b,i)=>b.index===i && /^#[0-9a-f]{6}$/.test(b.color)));

// Example climate situations spanning every reference category.
const checks=[
 [-22,.50,0,0], [0,.50,0,0], [5,.72,0,0],
 [13,.80,0,0], [13,.49,0,0], [20,.80,0,0],
 [17,.53,35,0], [28,.70,0,0], [31,.06,0,0],
 [30,.17,0,0], [16,.29,0,0], [30,.25,0,0],
 [28,.34,0,0], [28,.44,0,0], [28,.55,0,0],
 [28,.86,0,0], [8,.80,0,3500], [12,.80,0,1800]
];
checks.forEach(([temperatureC,moisture,latitudeDeg,elevationM],index)=>{
 assert.equal(classifyBiome({temperatureC,moisture,latitudeDeg,elevationM}),index,
   'Biome '+BIOMES[index].label);
});
assert.throws(()=>classifyBiome({temperatureC:NaN,moisture:.5}),/finite/);

const width=64,rows=32,cells=width*rows;
const land=new Float32Array(cells).fill(1);
const elevation=new Float32Array(cells);
const sinLat=Float64Array.from({length:rows},(_,y)=>Math.cos(Math.PI*(y+.5)/rows));
for(let i=0;i<cells;i++){
 land[i]=(i%width)%13<10?1:0;
 elevation[i]=i%29===0?3400:100;
}
const terrain={width,rows,land,elevation,sinLat};
const a=generateBiomeLayer({terrain,seed:1234});
const b=generateBiomeLayer({terrain,seed:1234});
assert.deepEqual(a.ids,b.ids,'Same seed and geography reproduce the same layer');
assert.equal(a.provisional,true,'Without a climate frame, the map is provisional');
let landCount=0;
for(let i=0;i<cells;i++){
 if(land[i]<.5)assert.equal(a.ids[i],WATER_BIOME,'Water never receives a terrestrial biome');
 else{assert(a.ids[i]<BIOMES.length);landCount++;}
}
assert.equal(a.counts.reduce((x,y)=>x+y,0),landCount);
assert(a.counts.filter(Boolean).length>=6,'Climate zones should be diverse');

function syntheticFrame(steps,t,cloud){
 const fields=new Float32Array(2*cells);
 fields.fill(t,0,cells);
 fields.fill(cloud,cells);
 return {grid:{cells,longitude:width,latitude:rows},steps,fields};
}
let normal=accumulateBiomeClimate(null,syntheticFrame(10,300,.8));
assert.equal(normal.samples,1);
const once=accumulateBiomeClimate(normal,syntheticFrame(10,280,0));
assert.equal(once.samples,1,'Duplicate steps cannot double-count climate averages');
normal=accumulateBiomeClimate(normal,syntheticFrame(20,280,.2));
assert.equal(normal.samples,2);
assert(Math.abs(normal.temperatureK[0]-290)<1e-4);
assert(Math.abs(normal.cloudFraction[0]-.5)<1e-4);
const mapped=generateBiomeLayer({terrain,climate:normal,climateTerrain:terrain,seed:1234});
assert.equal(mapped.provisional,false);
assert.equal(mapped.moistureSource,'Cloud-cover proxy');
assert(mapped.ids.every((v,i)=>land[i]<.5?v===WATER_BIOME:v<18));
assert.throws(()=>generateBiomeLayer({terrain,planet:'venus'}),/habitable/);
assert.throws(()=>generateBiomeLayer({terrain:{...terrain,land:[]}}),/complete/);
console.log('18 biome examples, deterministic seeded grid, ocean mask, climate averages and invalid input: passed');
