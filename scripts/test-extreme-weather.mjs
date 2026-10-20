import test from 'node:test';
import assert from 'node:assert/strict';
import {surfaceProfiles,defaultSurfaceConfig,estimateSurface,validateSurfaceConfig} from '../dist/surface-model.js';
import {windSampler} from '../dist/planet-tool/streamlines.js';
import {createCloudLayer} from '../dist/planet-tool/clouds.js';
const run=(p='locked',a='nitrogen',c={})=>estimateSurface(p,a,{...defaultSurfaceConfig(p,a),...c});
test('all supported weather fields are finite, bounded and reproducible; airless stays unavailable',()=>{
 for(const [p,s] of Object.entries(surfaceProfiles))for(const a of s.atmospheres){
  const e=run(p,a),n=e.grid.cells;
  assert.deepEqual(e.fields,run(p,a).fields);
  assert.ok(e.fields.slice(0,n).every(Number.isNaN));
  if(p==='ice'){assert.equal(windSampler(e),null);assert.ok(e.fields.slice(n,4*n).every(Number.isNaN));continue;}
  assert.ok(e.fields.slice(n,4*n).every(Number.isFinite));assert.ok(e.fields.slice(n,2*n).every(v=>v>=0&&v<=1));
  assert.ok(e.parameters.weather.max_wind_m_s<=(p==='silicate'?500:120));
  const sample=windSampler(e);for(const lat of [-Math.PI/2,0,Math.PI/2])assert.ok(sample(0,lat));
  assert.deepEqual(sample(-Math.PI,0),sample(Math.PI,0));
 }
});
test('locked illumination rotates temperature, winds and clouds together across the seam',()=>{
 const a=run(),b=run('locked','nitrogen',{substellar:90}),n=a.grid.cells,w=64;
 for(const offset of [1,2,3,6])for(let y=0;y<32;y++)for(let x=0;x<w;x++){
  // Noise is tied to longitude, so cloud comparison is statistical below.
  if(offset===1)continue;
  assert.ok(Math.abs(a.fields[offset*n+y*w+x]-b.fields[offset*n+y*w+(x+16)%w])<1e-4);
 }
 assert.ok(Math.abs(a.parameters.weather.mean_cloud_fraction-b.parameters.weather.mean_cloud_fraction)<0.02);
 const nonlocked=run('locked','nitrogen',{tidalLock:0});assert.notDeepEqual(a.fields,nonlocked.fields);
 assert.equal(a.parameters.diurnalMix,0);
});
test('surface flow converges toward locked heating, reacts to rotation, drag and radius',()=>{
 const slow=run('locked','nitrogen',{rotation:100}),n=slow.grid.cells;
 const sample=windSampler(slow);assert.ok(sample(Math.PI/2,0).u<0);assert.ok(sample(-Math.PI/2,0).u>0);
 const fast=run('locked','nitrogen',{rotation:1});assert.notDeepEqual(slow.fields.slice(2*n,4*n),fast.fields.slice(2*n,4*n));
 const drag=run('locked','nitrogen',{rotation:100,drag:5});assert.ok(drag.parameters.weather.max_wind_m_s<slow.parameters.weather.max_wind_m_s);
 assert.notDeepEqual(run().fields,run('locked','nitrogen',{radius:2,gravity:2}).fields);
});
test('dry supply removes clouds without removing winds; wet cloud shell retains equal-area coverage',()=>{
 const dry=run('locked','nitrogen',{moisture:0}),wet=run(),n=wet.grid.cells;
 assert.ok(dry.fields.slice(n,2*n).every(v=>v===0));assert.ok(dry.fields.slice(2*n,4*n).some(v=>v!==0));
 const layer=createCloudLayer(ExoTerrain.defaults,'simulation',wet,2);
 for(let y=0;y<32;y++)for(let x=0;x<64;x++){
  const i=2*y*128+2*x;
  assert.ok(Math.abs((layer.alpha[i]+layer.alpha[i+1]+layer.alpha[i+128]+layer.alpha[i+129])/4-wet.fields[n+y*64+x])<1e-7);
 }
 assert.equal(layer.edges[16],Math.asin(.5));
});
test('invalid physical controls are rejected and legacy configs gain safe defaults',()=>{
 const defaults=defaultSurfaceConfig('locked','nitrogen');
 for(const c of [{radius:0},{gravity:NaN},{drag:0},{moisture:2},{tidalLock:.5},{substellar:181}])assert.throws(()=>validateSurfaceConfig('locked','nitrogen',{...defaults,...c}));
 assert.equal(run('silicate','silicate',{tidalLock:0}).config.tidalLock,1);
});
