import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudLayer,cloudIndex,CLOUD_RADIUS} from '../dist/planet-tool/clouds.js';
import {Globe} from '../dist/planet-tool/globe.js';
import {readPalettePixels,palettePixels,readPaletteFile} from '../dist/planet-tool/palette.js';
import '../dist/model-config.js';

const settings={...ExoTerrain.defaults},grid=ExoConfig.resolution();
function frame(coverage){const fields=new Float32Array(7*2048+68);fields.fill(coverage,2048,4096);return {fields,grid,steps:48,dt:1800};}

test('cloud detail repeats deterministically, drifts with simulation time and stays on the sphere at the seam',()=>{
 const f=frame(.5),a=createCloudLayer(settings,'simulation',f,2),b=createCloudLayer(settings,'simulation',f,2);
 assert.deepEqual(a,b);assert.ok(a.alpha.some(value=>Math.abs(value-.5)>.05));
 const later=createCloudLayer(settings,'simulation',{...f,steps:480},2);assert.notDeepEqual(a.alpha,later.alpha);
 for(const lat of [-Math.PI/2,-1,0,1,Math.PI/2]){
  assert.equal(cloudIndex(a,-Math.PI,lat),cloudIndex(a,Math.PI,lat));
  assert.ok(cloudIndex(a,0,lat)>=0&&cloudIndex(a,0,lat)<a.alpha.length);
 }
 const original=createCloudLayer(settings,'original',null,2);
 assert.ok(original.alpha.some(value=>value===0));assert.ok(original.alpha.some(value=>value>.5));
 assert.equal(createCloudLayer(settings,'simulation',null,2),null);
 for(const [coverage,target] of [[0,0],[1,1]])assert.ok(createCloudLayer(settings,'simulation',frame(coverage),2).alpha.every(value=>value===target));
});

test('the cloud shell draws outside the ground silhouette, with clear holes and no scientific-field overlay',()=>{
 const ctx={createImageData:(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)}),putImageData(){}};
 const canvas={getContext:()=>ctx,addEventListener(){}};
 const globe=new Globe(canvas),texture={width:64,height:32,data:new Uint8ClampedArray(64*32*4)};
 for(let i=0;i<texture.data.length;i+=4)texture.data.set([25,100,40,255],i);
 const palette=Array(20).fill('#ffffff');
 for(const size of [256,512]){
  globe.setSize(size);globe.draw(texture,false);
  const ground=globe.image.data.slice(),cloudy=createCloudLayer(settings,'simulation',frame(1),size/256);
  globe.draw(texture,false,cloudy,palette);
  let outside=0;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const r=Math.hypot(x+.5-size/2,y+.5-size/2),i=(y*size+x)*4;
   if(r>globe.radius&&r<globe.radius*CLOUD_RADIUS-.5){assert.equal(ground[i],10);assert.ok(globe.image.data[i]>50);outside++;}
   if(r>globe.radius*CLOUD_RADIUS)assert.deepEqual(Array.from(globe.image.data.slice(i,i+4)),[10,18,33,255]);
  }
  assert.ok(outside>1000);
  globe.draw(texture,false,createCloudLayer(settings,'simulation',frame(0),size/256),palette);assert.deepEqual(globe.image.data,ground);
  globe.draw(texture,true);const scientific=globe.image.data.slice();globe.draw(texture,true,cloudy,palette);assert.deepEqual(globe.image.data,scientific);
  assert.ok(globe.surfaceZ.byteLength+globe.cloudZ.byteLength<=2*1024*1024);
 }
});

test('palette sprite pixels keep their top-down row order and reject transparent or oversized images',async()=>{
 const colors=[...ExoTerrain.palette];colors[0]='#123456';colors[19]='#abcdef';
 const pixels=palettePixels(colors);assert.deepEqual(readPalettePixels(pixels,5,4),colors);
 pixels[3]=0;assert.throws(()=>readPalettePixels(pixels,5,4),/opaque/);
 assert.throws(()=>readPalettePixels(new Uint8Array(80),4,5),/5 × 4/);
 const png=new Uint8Array(33);png.set([137,80,78,71]);new DataView(png.buffer).setUint32(16,5000);new DataView(png.buffer).setUint32(20,4000);
 await assert.rejects(readPaletteFile({size:png.length,arrayBuffer:async()=>png.buffer}),/5 × 4/);
});
