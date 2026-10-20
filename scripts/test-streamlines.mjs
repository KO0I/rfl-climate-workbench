import test from 'node:test';
import assert from 'node:assert/strict';
import {windSampler,sphereStep,traceStreamlines,projectMap,projectGlobe,streamlineMarker,morphStreamlines,SurfaceStreamlines} from '../dist/planet-tool/streamlines.js';
import {faceDirection} from '../dist/planet-tool/cubemap.js';
import '../dist/terrain.js';

function frame(u=20,v=0,cloud=.6){
 const grid={longitude:64,latitude:32,cells:2048},fields=new Float32Array(7*2048+64);
 fields.fill(cloud,2048,4096);fields.fill(u,4096,6144);fields.fill(v,6144,8192);
 fields.set(ExoTerrain.gaussianGrid(32).sinLat,7*2048);
 return {grid,fields};
}
const near=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}`);

test('wind sampler interpolates Gaussian latitudes, wraps longitude and rejects unavailable fields',()=>{
 const f=frame(),n=f.grid.cells;
 for(let y=0;y<32;y++)for(let x=0;x<64;x++)f.fields[2*n+y*64+x]=y;
 const lat=Array.from(f.fields.slice(7*n,7*n+32),Math.asin),sample=windSampler(f);
 near(sample(0,(lat[10]+lat[11])/2).u,10.5);
 assert.deepEqual(sample(-Math.PI,.3),sample(Math.PI,.3));
 near(sample(0,Math.PI/2).u,0);near(sample(0,-Math.PI/2).u,31);
 assert.equal(windSampler(null),null);assert.equal(windSampler({...f,model:'surface-estimate'}),null);
 f.fields[2*n]=NaN;assert.equal(windSampler(f)(0,Math.PI/2),null);
});

test('streamlines travel in wind direction, are finite at the poles, and omit calm flow',()=>{
 const east=windSampler(frame(20,0)),north=windSampler(frame(0,20));
 const a=sphereStep(0,0,20,0,.01),b=sphereStep(0,0,0,20,.01);
 assert.ok(a[0]>0);near(a[1],0);assert.ok(b[1]>0);near(b[0],0);
 const e=traceStreamlines(east),n=traceStreamlines(north);
 assert.ok(e.length>100&&n.length>100);assert.deepEqual(traceStreamlines(windSampler(frame(0,0))),[]);
 for(const path of [...e,...n])for(const p of path)assert.ok([p.lon,p.lat,p.speed,p.cloud].every(Number.isFinite));
 for(const lat of [-Math.PI/2,Math.PI/2])assert.ok(sphereStep(0,lat,20,10,.01).every(Number.isFinite));
 assert.deepEqual(e,traceStreamlines(east),'stable seeds avoid flicker between redraws');
});

test('all cube faces match existing cube sampling and globe projection follows camera rotation',()=>{
 for(const face of ['px','nx','py','ny','pz','nz'])for(const [u,v] of [[0,0],[.6,-.5],[-.7,.8]]){
  const [x,y,z]=faceDirection(face,u,v),point={lon:Math.atan2(x,z),lat:Math.asin(y)};
  const p=projectMap(point,face,256,256);assert.ok(p);near(p.x,(u+1)/2*255);near(p.y,(v+1)/2*255);
  assert.equal(projectMap(point,'cube',1024,768).face,face);
 }
 const globe={size:256,radius:102.4,pitch:0,yaw:0};
 const center=projectGlobe({lon:0,lat:0},globe);near(center.x,128);near(center.y,128);
 assert.equal(projectGlobe({lon:Math.PI,lat:0},globe),null);
 near(projectGlobe({lon:.6,lat:-.3},{...globe,yaw:.6,pitch:.3}).x,128);
 near(projectGlobe({lon:.6,lat:-.3},{...globe,yaw:.6,pitch:.3}).y,128);
 assert.ok(projectMap({lon:0,lat:.5},'latlon',1024,512).y<256);
});

test('overlays independently toggle, omit clear-sky cloud traces, stop offscreen and never mutate model fields',()=>{
 const queue=new Map(),events=new Map();let seq=0,strokes=0;
 const context={clearRect(){},beginPath(){},moveTo(...p){assert.ok(p.every(Number.isFinite));},lineTo(...p){assert.ok(p.every(Number.isFinite));},stroke(){strokes++;}};
 const canvas=()=>({width:1024,height:512,getContext:()=>context});
 const host={document:{hidden:false,addEventListener:(k,fn)=>events.set(k,fn)},window:{addEventListener(){}},requestAnimationFrame:fn=>{queue.set(++seq,fn);return seq;},cancelAnimationFrame:id=>queue.delete(id)};
 const map=canvas(),planet=canvas(),flow=new SurfaceStreamlines(map,planet,host),f=frame(),before=f.fields.slice();
 const o={view:'climate',projection:'latlon',bases:{climate:map,planet},wind:true,cloud:true,animate:true};
 flow.update(f,o);assert.ok(strokes>0&&queue.size===1);assert.ok(flow.projected.some(p=>p.kind==='wind'));assert.ok(flow.projected.some(p=>p.kind==='cloud'));
 for(const path of flow.projected)for(let i=1;i<path.points.length;i++)assert.ok(Math.abs(path.points[i].x-path.points[i-1].x)<map.width*.12,'no line across the seam');
 flow.update(f,{...o,wind:false});assert.ok(flow.projected.every(p=>p.kind==='cloud'));
 flow.update(f,{...o,cloud:false});assert.ok(flow.projected.every(p=>p.kind==='wind'));
 flow.update(f,{...o,wind:false,cloud:false});assert.equal(flow.projected.length,0);assert.equal(queue.size,0);
 flow.update(frame(20,0,0),{...o,wind:false,animate:false});assert.equal(flow.projected.length,0);
 flow.update(f,{...o,animate:false});assert.ok(flow.projected.length>0);assert.equal(queue.size,0);
 flow.update(f,{...o,view:'gas'});assert.equal(flow.projected.length,0);assert.equal(queue.size,0);
 flow.update(f,o);host.document.hidden=true;events.get('visibilitychange')();assert.equal(queue.size,0);
 host.document.hidden=false;events.get('visibilitychange')();assert.equal(queue.size,1);
 flow.update(null,o);assert.equal(flow.projected.length,0);assert.equal(queue.size,0);
 assert.deepEqual(f.fields,before);
});

function animationHarness(){
 const queue=new Map(),events=new Map();let seq=0,strokes=0;
 const context={clearRect(){},beginPath(){},moveTo(...p){assert.ok(p.every(Number.isFinite));},lineTo(...p){assert.ok(p.every(Number.isFinite));},stroke(){assert.ok(this.globalAlpha>=0&&this.globalAlpha<=1);strokes++;}};
 const canvas=()=>({width:1024,height:512,getContext:()=>context}),map=canvas(),planet=canvas();
 const host={document:{hidden:false,addEventListener:(k,fn)=>events.set(k,fn)},window:{addEventListener(){}},requestAnimationFrame:fn=>{queue.set(++seq,fn);return seq;},cancelAnimationFrame:id=>queue.delete(id)};
 const flow=new SurfaceStreamlines(map,planet,host);
 const options={view:'climate',projection:'latlon',bases:{climate:map,planet},wind:true,cloud:true,animate:true,globe:{size:1024,radius:410,pitch:0,yaw:0}};
 const tick=t=>{assert.equal(queue.size,1,'exactly one animation loop');const [id,fn]=queue.entries().next().value;queue.delete(id);fn(t);};
 return {flow,options,host,events,queue,tick,strokes:()=>strokes};
}

test('markers interpolate between samples, turn continuously, and fade before restarting',()=>{
 const points=[{x:0,y:0,cloud:.6,progress:0},{x:10,y:0,cloud:.6,progress:.5},{x:10,y:10,cloud:.6,progress:1}];
 near(streamlineMarker(points,.123).x,2.46);
 near(streamlineMarker(points,.124).x,2.48);
 const before=streamlineMarker(points,.499),after=streamlineMarker(points,.501);
 assert.ok(Math.abs(after.angle-before.angle)<.1,'no sudden right-angle turn at a sample');
 assert.equal(streamlineMarker(points,0).opacity,0);assert.equal(streamlineMarker(points,1).opacity,0);
 assert.ok(streamlineMarker(points,.999).opacity<.001);
 assert.ok(streamlineMarker(points,.001).opacity<.001);
 assert.equal(streamlineMarker(points,.5).opacity,1);
 const fragment=points.slice(1);
 assert.equal(streamlineMarker(fragment,.25),null,'clipping does not restart the marker on each fragment');
 near(streamlineMarker(fragment,.75).y,5);
});

test('motion runs on every display frame and is independent of display cadence',()=>{
 function run(hz){
  const h=animationHarness();h.flow.update(frame(),h.options);h.tick(0);
  const marker=h.flow.markers.get('wind:3'),start=marker.phase;
  for(let i=1;i<=hz;i++){const strokes=h.strokes();h.tick(i*1000/hz);assert.ok(h.strokes()>strokes);}
  near(marker.phase,(start+marker.rate)%1);
  return marker.phase;
 }
 near(run(30),run(60));near(run(60),run(120));
});

test('camera, projection, resize, and repeated updates preserve each spherical tracer and its clock',()=>{
 const h=animationHarness(),f=frame();h.flow.update(f,h.options);h.tick(0);h.tick(16);
 const marker=h.flow.markers.get('wind:50'),phase=marker.phase;
 h.flow.update(f,{...h.options,projection:'cube'});
 assert.strictEqual(h.flow.markers.get('wind:50'),marker);near(marker.phase,phase);
 assert.equal(h.flow.layers.length,1);assert.equal(h.flow.last,16);
 for(const yaw of [0,.5,2.1]){
  h.flow.update(f,{...h.options,view:'planet',globe:{...h.options.globe,yaw}});
  near(marker.phase,phase);
  for(const path of h.flow.projected){
   assert.ok(h.flow.markers.has(path.id));
   for(let i=1;i<path.points.length;i++)assert.ok(path.points[i].progress>path.points[i-1].progress);
  }
 }
 h.options.bases.climate.width=2048;h.flow.update(f,h.options);
 h.tick(32);assert.ok(marker.phase>phase,'updates do not reset the animation timestamp');
});

test('snapshots morph one path per seed, preserve arrows, and rebase interruptions without jumps',()=>{
 const h=animationHarness(),first=frame(20),second=frame(0,45),third=frame(-30);
 const original=first.fields.slice();h.flow.update(first,h.options);h.tick(0);h.tick(16);
 const old=structuredClone(h.flow.target.paths),marker=h.flow.markers.get('wind:10'),phase=marker.phase,rate=marker.rate;
 const sameGeometry=(a,b)=>{
  for(const kind of ['wind','cloud'])for(let i=0;i<a[kind].length;i++){
   near(a[kind][i].opacity,b[kind][i].opacity);
   for(let j=0;j<a[kind][i].length;j++)for(const key of ['x','y','z','cloud','speed'])near(a[kind][i][j][key],b[kind][i][j][key],1e-10);
  }
 };
 h.flow.update(second,h.options);
 assert.equal(h.flow.layers.length,1,'matching streams never form double images');
 sameGeometry(old,h.flow.target.paths);near(marker.phase,phase);near(marker.rate,rate);
 assert.ok(marker.targetRate>rate);
 h.tick(66);assert.ok(marker.rate>rate&&marker.rate<marker.targetRate);
 const moving=structuredClone(h.flow.target.paths);
 assert.notEqual(moving.wind[10][30].y,old.wind[10][30].y,'the geometry itself moves');
 h.flow.update(third,h.options);sameGeometry(moving,h.flow.target.paths);
 for(let t=82;t<=546;t+=16)h.tick(t);
 assert.equal(h.flow.transition,null);assert.strictEqual(h.flow.target.paths,h.flow.paths);
 assert.deepEqual(first.fields,original,'display morphs cannot alter model data');
 for(let i=0;i<20;i++)h.flow.update(frame(10+i),h.options);
 assert.equal(h.flow.layers.length,1);assert.equal(h.flow.target.paths.wind.length,190);
 h.flow.update(third,{...h.options,animate:false});assert.equal(h.flow.transition,null);assert.strictEqual(h.flow.target.paths,h.flow.paths);assert.equal(h.queue.size,0);
});

test('morphs take the short spherical route over seams and poles, matching unequal paths by distance',()=>{
 function path(seed,coords){const p=coords.map(([lon,lat])=>({lon,lat,speed:20,cloud:.6}));p.seed=seed;return p;}
 const from={wind:[path(7,[[3.12,0],[3.13,.1],[3.14,.2]])],cloud:[]};
 const to={wind:[path(7,[[-3.12,0],[-3.115,.05],[-3.11,.1],[-3.105,.15],[-3.10,.2]])],cloud:[]};
 const morph=morphStreamlines(from,to),mid=morph.at(.5).wind[0];
 assert.equal(mid.length,48);assert.equal(mid.seed,7);
 for(const p of mid){near(Math.hypot(p.x,p.y,p.z),1);assert.ok(p.z<-.9,'does not sweep across the map through longitude zero');}
 const pole=morphStreamlines({wind:[path(3,[[0,1.5],[0,1.55],[0,1.56]])],cloud:[]},{wind:[path(3,[[Math.PI,1.5],[Math.PI,1.55],[Math.PI,1.56]])],cloud:[]}).at(.5);
 for(const p of pole.wind[0]){assert.ok([p.x,p.y,p.z].every(Number.isFinite));near(p.y,1);}
 const reordered={wind:[path(8,[[0,0],[.1,0],[.2,0]]),to.wind[0]],cloud:[]};
 const mixed=morphStreamlines(from,reordered).at(.5);
 assert.equal(mixed.wind.find(p=>p.seed===7).opacity,1);near(mixed.wind.find(p=>p.seed===8).opacity,.5);
 near(morphStreamlines(reordered,from).at(.5).wind.find(p=>p.seed===8).opacity,.5);
});

test('every interpolated view keeps seams clipped and replay duration follows its cadence',()=>{
 const h=animationHarness();h.flow.update(frame(25,-10),h.options);h.tick(0);
 for(const projection of ['latlon','cube','px','nx','py','ny','pz','nz']){
  const o={...h.options,projection,transitionSeconds:.125};
  h.flow.update(frame(-30,15),o);assert.equal(h.flow.transition.duration,.125);
  for(let i=1;i<=4;i++){
   h.tick((h.flow.last??0)+40);
   for(const path of h.flow.projected)for(let j=1;j<path.points.length;j++){
    const a=path.points[j-1],b=path.points[j];assert.equal(a.face,b.face);assert.ok(Math.hypot(b.x-a.x,b.y-a.y)<=1024*.12);
   }
  }
  assert.equal(h.flow.transition,null);
 }
 h.flow.update(frame(15,30),{...h.options,view:'planet'});h.tick(h.flow.last+16);
 assert.ok(h.flow.projected.length>0);
});

test('rapid replay stays bounded, fades into calm flow, and resumes without hidden-time jumps',()=>{
 const h=animationHarness();h.flow.update(frame(),h.options);h.tick(0);
 for(let i=1;i<=80;i++){
  if(i%4===0)h.flow.update(frame(i%8?20:-20,10),h.options);
  h.tick(i*16);assert.equal(h.flow.layers.length,1);near(h.flow.layers.reduce((sum,l)=>sum+l.opacity,0),1);
 }
 h.host.document.hidden=true;h.events.get('visibilitychange')();assert.equal(h.queue.size,0);
 const marker=h.flow.markers.get('wind:10'),phase=marker.phase;
 h.host.document.hidden=false;h.events.get('visibilitychange')();h.tick(100000);near(marker.phase,phase);
 h.flow.update(frame(0,0),h.options);
 for(let i=1;i<=30;i++)if(h.queue.size)h.tick(100000+i*16);
 assert.equal(h.flow.projected.length,0);assert.equal(h.queue.size,0);assert.equal(h.flow.layers.length,1);
 h.flow.update(null,h.options);assert.equal(h.flow.layers.length,0);assert.equal(h.flow.markers.size,0);
});
