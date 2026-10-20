import test from 'node:test';
import assert from 'node:assert/strict';
import {encodePolarClouds,decodePolarClouds,samplePolarCoverage,samplePolarVolume} from '../dist/polar-clouds.js';
import {preparePolarFlow} from '../dist/polar-flow.js';
const state={Ro:10**-1.61,E:10**-4.72,regime:'polygon',m:6,time:5,phaseN:.28,phaseS:-.28,storms:[{lat:28,lon:34,sigma:8,gamma:18,age:7,life:22}]};
const pack=encodePolarClouds(state),decoded=decodePolarClouds(JSON.parse(JSON.stringify(pack)));
test('compact pack roundtrips four distinct correlated decks and exact snapshot state',()=>{
 assert.deepEqual(pack.flow_state,state);assert.deepEqual(pack.layers.map(l=>l.radius_ratio),[1,.955,.91,.865]);
 assert.equal(decoded.density.length,128*64*4);assert.equal(decoded.wind.length,128*64*4);
 assert.deepEqual(encodePolarClouds(state),pack,'Same seed and captured state are reproducible');
 const channels=pack.layers.map((_,k)=>decoded.density.filter((v,i)=>i%4===k));
 for(const c of channels){assert.ok(Math.min(...c)<30);assert.ok(Math.max(...c)>220);}
 assert.notDeepEqual(channels[0],channels[1]);
 const changed=encodePolarClouds({...state,m:8});assert.notEqual(changed.density.data,pack.density.data);assert.notEqual(changed.wind.data,pack.wind.data);
 assert.notEqual(encodePolarClouds(state,{seed:21}).density.data,pack.density.data);
});
test('wind texture matches shared globe wind and is tangent in both hemispheres',()=>{
 const field=preparePolarFlow(state),w=pack.width,h=pack.height;
 for(const [x,y] of [[0,0],[0,h-1],[0,5],[17,12],[127,31],[61,54]]){
  const lat=(.5-y/(h-1))*Math.PI,lon=((x+.5)/w-.5)*Math.PI*2;
  const n=y===0?[0,1,0]:y===h-1?[0,-1,0]:[Math.cos(lat)*Math.cos(lon),Math.sin(lat),Math.cos(lat)*Math.sin(lon)];
  const v=field({x:n[0],y:n[1],z:n[2]});assert.ok(Math.abs(v.reduce((a,b,k)=>a+b*n[k],0))<1e-9);
  v.forEach((a,k)=>assert.ok(Math.abs(a-(decoded.wind[(y*w+x)*4+k]-128)*pack.wind.scale)<pack.wind.scale*.501));
 }
});
test('maps wrap at longitude seam, agree at poles, animate continuously and stay in radial decks',()=>{
 for(const lat of [-1.4,0,1.4])for(const time of [0,4,7.99999,8,15.99999,16,800]){
  const a=[-Math.cos(lat),Math.sin(lat),1e-9],b=[a[0],a[1],-1e-9];
  assert.ok(Math.abs(samplePolarCoverage(decoded,a,0,time)-samplePolarCoverage(decoded,b,0,time))<1e-5);
 }
 for(const sign of [-1,1]){const p=[0,sign,0];assert.equal(samplePolarCoverage(decoded,p,0,0),samplePolarCoverage(decoded,p,0,100));}
 const n=[.35,.8,.2];for(const time of [8,16])assert.ok(Math.abs(samplePolarCoverage(decoded,n,2,time-1e-5)-samplePolarCoverage(decoded,n,2,time+1e-5))<1e-4);
 assert.notEqual(samplePolarCoverage(decoded,n,0,0),samplePolarCoverage(decoded,n,0,3));
 assert.equal(samplePolarVolume(decoded,[0,1.1,0]),0);assert.equal(samplePolarVolume(decoded,[0,.64,0]),0);assert.ok(samplePolarVolume(decoded,[0,1,0])>=0);
 const fine=decodePolarClouds(encodePolarClouds(state,{width:256}));assert.equal(fine.density.length,256*128*4);
});
test('invalid and oversized packs fail before allocating textures',()=>{
 for(const p of [{...pack,version:2},{...pack,width:8192},{...pack,layers:[]},{...pack,wind:{...pack.wind,scale:NaN}},{...pack,density:{...pack.density,data:'AAAA'}}])assert.throws(()=>decodePolarClouds(p));
 assert.throws(()=>encodePolarClouds({...state,Ro:NaN}));assert.throws(()=>encodePolarClouds(state,{width:1024}));
});
