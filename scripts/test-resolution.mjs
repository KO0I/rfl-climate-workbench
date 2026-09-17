import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import '../dist/model-config.js';
import '../dist/terrain.js';
import {Playback} from '../dist/playback.js';
import {Globe} from '../dist/planet-tool/globe.js';
import * as clouds from '../dist/planet-tool/clouds.js';
import {drawCubeMap} from '../dist/planet-tool/cubemap.js';
import * as palette from '../dist/planet-tool/palette.js';
import * as worlds from '../dist/world-catalog.js';
import * as surface from '../dist/surface-model.js';
import {randomSurface} from '../dist/planet-tool/random-surface.js';
import {errorMessage} from '../dist/engine-loader.js';
import {solverDefaults,solverPreset,solverKnobs} from '../dist/terrain-solver.js';

const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const app=(await readFile(new URL('../dist/app.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');

// Model/control integration in Node with canvas calls recorded, not browser UI QA.
class Element {
 constructor(){this.value='';this.style={};this.parentElement={style:{}};this.children=[];this.attributes={};this.queries=new Map();this.width=1024;this.height=512;this.clientWidth=400;this.disabled=false;this.dataset={};}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;}
 get options(){return this.children.flatMap(c=>c.children?.length?c.options:[c]);}
 get selectedOptions(){return this.options.filter(c=>c.value===this.value);}
 setAttribute(k,v){this.attributes[k]=v;}
 getAttribute(k){return this.attributes[k];}
 click(){return this.onclick?.();}
 focus(){this.focused=true;}
 addEventListener(){}
 closest(){return this.querySelector('label');}
 checkValidity(){return true;}
 querySelector(q){if(!this.queries.has(q))this.queries.set(q,new Element());return this.queries.get(q);}
 getContext(){
  if(this.context)return this.context;
  const fills=[],clears=[],images=[];
  const image=(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)});
  this.context={fills,clears,images,
   createImageData:image,getImageData:(x,y,w,h)=>image(w,h),
   fillRect(x,y,w,h){assert.ok([x,y,w,h].every(Number.isFinite));assert.ok(!/NaN|undefined/.test(this.fillStyle));fills.push({x,y,w,h,color:this.fillStyle});},
   clearRect(...rect){clears.push(rect);fills.length=0;},
   drawImage(){},putImageData(data){images.push([data.width,data.height]);},
   beginPath(){},stroke(){},strokeRect(){},fillText(){},
   moveTo(...p){assert.ok(p.every(Number.isFinite));},lineTo(...p){assert.ok(p.every(Number.isFinite));}
  };
  return this.context;
 }
}

function harness(){
 const elements=new Map();
 for(const [,id] of html.matchAll(/\bid="([^"]+)"/g)){const el=new Element();el.id=id;elements.set(id,el);}
 const el=id=>elements.get(id);
 for(const [,id,rest] of html.matchAll(/<input\b[^>]*\bid="([^"]+)"([^>]*)>/g))el(id).value=/\bvalue="([^"]*)"/.exec(rest)?.[1]??'';
 for(const [,id,contents] of html.matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)){
  for(const [,value,attrs] of contents.matchAll(/<option value="([^"]+)"([^>]*)>/g)){
   const option=new Element();option.value=value;option.disabled=/\bdisabled\b/.test(attrs);el(id).append(option);
   if(!el(id).value||/\bselected\b/.test(attrs))el(id).value=value;
  }
 }
 const tabs=['climate','planet','atmosphere','gas'].map(name=>{const tab=el('tab-'+name);tab.setAttribute('aria-controls','panel-'+name);return tab;});
 const generatorTabs=['quick','solver'].map(name=>{const tab=el('generator-tab-'+name);tab.setAttribute('aria-controls','generator-panel-'+name);return tab;});
 const panels=['map','planet'].map(name=>{const panel=new Element();panel.dataset.view=name;return panel;});
 const document={getElementById:el,createElement:()=>{const item=new Element();Object.defineProperty(item,'id',{set(value){this.identifier=value;elements.set(value,this);},get(){return this.identifier;}});return item;},createTextNode:text=>({textContent:text}),
  querySelectorAll:q=>q==='.workspace-nav [role=tab]'?tabs:q==='.generator-tabs [role=tab]'?generatorTabs:q==='[role=tab]'?[...tabs,...generatorTabs]:q==='.playback'?panels:q==='.playback select'?panels.map(p=>p.querySelector('select')):q==='#terrain-controls input'?['seed','sea','frequency','relief'].map(k=>el('terrain-'+k)):[]};
 const timers=new Map(),intervals=new Map(),loads=[],solverLoads=[],workers=[],revoked=[];let timerId=0;
 class Worker {
  constructor(){this.messages=[];workers.push(this);}
  postMessage(message){this.messages.push(message);}
  terminate(){this.terminated=true;}
 }
 const context=vm.createContext({document,window:{addEventListener(){}},ExoConfig:globalThis.ExoConfig,ExoTerrain:globalThis.ExoTerrain,
  initMagicTab:()=>({setActive(){},pauseForClimate(){}}),
  ...worlds,...surface,...palette,...clouds,Playback,Globe,drawCubeMap,randomSurface,errorMessage,AbortController,Worker,crypto:globalThis.crypto,solverDefaults,solverPreset,solverKnobs,
  generateSolver:(settings,seed,{signal})=>new Promise((resolve,reject)=>solverLoads.push({settings,seed,signal,resolve,reject})),
  URL:{revokeObjectURL:url=>revoked.push(url)},
  loadClimateEngine:signal=>new Promise(resolve=>loads.push({signal,resolve})),
  setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
  setInterval:fn=>{const id=++timerId;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id)});
 const run=code=>vm.runInContext(code,context);
 run(app);
 const change=value=>{el('surface-resolution').value=value;el('surface-resolution').onchange();};
 const start=async()=>{
  const pending=run('startRun()'),load=loads.at(-1);
  load.resolve({workerURL:'blob:test-engine',wasmBinary:new ArrayBuffer(8),modelData:new ArrayBuffer(8)});
  await pending;
  const worker=workers.at(-1);worker.onmessage({data:{type:'ready'}});return worker;
 };
 const frame=steps=>{
  const grid=globalThis.ExoConfig.resolution(run('surfaceResolution')),terrain=globalThis.ExoTerrain.generate({},grid.longitude),n=grid.cells,fields=new Float32Array(7*n+2*grid.latitude+4);
  fields.fill(280,0,n);fields.fill(.25,n,2*n);fields.fill(20,2*n,4*n);fields.fill(100000,4*n,5*n);
  fields.set(terrain.land,5*n);fields.fill(285,6*n,7*n);fields.set(terrain.sinLat,7*n);fields.set(terrain.weights,7*n+grid.latitude);
  return {type:'frame',fields,grid,steps,dt:grid.timestepMinutes*60,target:10*1440/grid.timestepMinutes,runningMs:1000};
 };
 return {el,run,change,start,frame,loads,solverLoads,workers,timers,intervals,revoked,panels};
}

test('gas tab selects its own controls and restores the rocky workspace without resetting terrain',()=>{
 const h=harness(),before=h.run('terrain');h.run('showTab("gas")');
 assert.equal(h.el('rocky-settings').hidden,true);assert.equal(h.el('gas-settings').hidden,false);
 assert.equal(h.el('panel-gas').hidden,false);assert.equal(h.el('panel-climate').hidden,true);
 assert.equal(h.el('field-toolbar').hidden,true);assert.equal(h.el('tab-gas').getAttribute('aria-selected'),'true');
 h.run('showTab("climate")');assert.equal(h.el('rocky-settings').hidden,false);assert.equal(h.el('gas-settings').hidden,true);
 assert.equal(h.el('panel-gas').hidden,true);assert.equal(h.run('terrain'),before);
});

test('resolution reaches terrain, globe, every map projection and export, then restores low res',()=>{
 const h=harness();
 h.run('globe.yaw=.7;globe.pitch=-.2');
 for(const [preset,scale] of [['high',2],['low',1]]){
  h.change(preset);
  assert.equal(h.run('displayTerrain.width'),64*scale);assert.equal(h.run('displayTerrain.rows'),32*scale);
  assert.equal(h.run('terrain.land.length'),2048);
  assert.equal(h.run('currentGrid().longitude'),64);assert.equal(h.run('currentGrid().latitude'),32);
  assert.equal(h.run('terrainExport().display_resolution.cells'),2048*scale*scale);
  assert.equal(h.run('terrainExport().display_resolution.latitude'),32*scale);
  assert.equal(h.el('planet').width,256*scale);assert.equal(h.el('planet').height,256*scale);
  h.run('showTab("planet")');
  assert.deepEqual(h.el('planet').getContext().images.at(-1),[256*scale,256*scale]);
  assert.equal(h.run('globe.yaw'),.7);assert.equal(h.run('globe.pitch'),-.2);
  h.run('showTab("climate")');
  for(const projection of ['latlon','cube','px','nx','py','ny','pz','nz']){
   h.el('projection').value=projection;h.el('projection').onchange();
   const [w,rows]=projection==='latlon'?[1024,512]:projection==='cube'?[1024,768]:[256,256];
   assert.equal(h.el('map').width,w*scale);assert.equal(h.el('map').height,rows*scale);
  }
 }
});

// Real numerical contents are checked separately against the C core. Here a
// distinguishable completed bundle exercises the asynchronous UI handoff.
function solvedBundle(){
 const make=width=>({...ExoTerrain.generate({seed:42},width),generator:'solver',water:new Float32Array(width*width/2),biomes:new Uint8Array(width*width/2)});
 return {low:make(64),high:make(128),overviewLow:{width:128,rows:64,elevation:new Float32Array(8192).fill(1200)},overviewHigh:{width:256,rows:128,elevation:new Float32Array(32768).fill(1400)},maxElevation:3000,stats:{vertices:24578,lakes:3,max_macro_slope_excess_m:0},config:{seed:'42',macro_resolution:64}};
}

test('generator tabs preserve quick terrain, apply solver samples everywhere, and isolate workspace tabs',async()=>{
 const h=harness(),initial=Array.from(h.run('terrain.elevation'));
 const pending=h.run('selectGenerator("solver")');
 assert.equal(h.el('run').disabled,true);assert.equal(h.el('generator-cancel').hidden,false);
 assert.equal(h.el('generator-tab-solver').getAttribute('aria-selected'),'true');
 h.run('showTab("planet")');
 assert.equal(h.el('generator-tab-solver').getAttribute('aria-selected'),'true');
 assert.equal(h.run('activeTab'),'planet');
 h.solverLoads[0].resolve(solvedBundle());await pending;
 assert.equal(h.el('run').disabled,false);assert.equal(h.el('generator-cancel').hidden,true);
 assert.equal(h.run('terrain.generator'),'solver');assert.notDeepEqual(Array.from(h.run('terrain.elevation')),initial);
 assert.equal(h.run('terrainExport().source'),'RFL C99 cubemap Terrain Solver, algorithm 2, WebAssembly');
 assert.equal(h.run('terrainExport().solver.config.seed'),'42');
 const pixel=h.el('terrain-heightmap').getContext().fills[0];
 assert.equal(pixel.color,h.run('color(1200/3000,colors("pressure"))'));
 h.change('high');assert.equal(h.run('displayTerrain.width'),128);assert.equal(h.run('terrain.width'),64);assert.equal(h.solverLoads.length,1);
 assert.equal(h.el('terrain-heightmap').width,256);assert.equal(h.el('terrain-heightmap').height,128);
 const w=await h.start();assert.equal(w.messages[0].terrainGrid.generator,'solver');
 assert.deepEqual(Array.from(w.messages[0].terrainGrid.elevation),Array.from(h.run('terrain.elevation')));
 assert.equal(h.el('generator-tab-quick').disabled,true);
 await h.run('selectGenerator("quick")');assert.equal(h.run('terrainGenerator'),'solver');
 h.run('reset()');await h.run('selectGenerator("quick")');assert.deepEqual(Array.from(h.run('terrain.elevation')),initial);
 await h.run('selectGenerator("solver")');assert.equal(h.solverLoads.length,1,'Switching back reuses the same solved world.');
});

test('cancelled and failed terrain requests cannot replace the displayed world or start a climate run',async()=>{
 const h=harness(),initial=Array.from(h.run('terrain.elevation'));
 const pending=h.run('selectGenerator("solver")');
 await h.run('selectGenerator("quick")');assert.equal(h.solverLoads[0].signal.aborted,true);
 h.solverLoads[0].resolve(solvedBundle());await pending;
 assert.equal(h.run('terrainGenerator'),'quick');assert.deepEqual(Array.from(h.run('terrain.elevation')),initial);
 const failed=h.run('selectGenerator("solver")');h.solverLoads[1].reject(new Error('No feasible lake level.'));await failed;
 assert.match(h.el('generator-status').textContent,/No feasible lake level/);
 assert.equal(h.el('run').disabled,true);assert.equal(h.el('terrain-controls').disabled,false);
 await assert.rejects(h.run('startRun()'),/Generate the selected terrain/);
 assert.deepEqual(Array.from(h.run('terrain.elevation')),initial);
 const retry=h.run('buildSolver()');h.solverLoads[2].resolve(solvedBundle());await retry;
 assert.equal(h.el('run').disabled,false);
 const w=await h.start();w.onmessage({data:h.frame(12)});w.onmessage({data:{type:'complete',log:''}});
 h.el('solver-noise_mix').value='.5';h.el('solver-noise_mix').oninput();
 assert.equal(h.run('latest'),null);assert.equal(h.run('playback.all.length'),0);assert.equal(h.el('run').disabled,true);
 assert.match(h.el('generator-status').textContent,/previous map/);
});

test('terrain height overview preserves 2:1 square pixels, doubled latitude detail and original climate grids',()=>{
 const h=harness();
 for(const [preset,size] of [['low',64],['high',128]]){
  h.change(preset);
  const canvas=h.el('terrain-heightmap'),ctx=canvas.getContext('2d');
  const width=size*2;
  assert.equal(canvas.width,width);assert.equal(canvas.height,size);
  assert.equal(ctx.fills.length,width*size);
  assert.ok(ctx.fills.every(pixel=>pixel.w===1&&pixel.h===1));
  assert.equal(h.run('terrain.rows'),32);assert.equal(h.run('terrain.land.length'),2048);
  assert.equal(h.run('displayTerrain.rows'),size/2);
  for(const [x,y] of [[0,0],[width/2,size/2],[width-1,size-1]]){
   const pixel=ctx.fills[y*width+x];
   assert.equal(pixel.x,x);assert.equal(pixel.y,y);
   const expected=h.run(`color(Math.max(0,(ExoTerrain.heightAt((${x}/${width}-.5)*2*Math.PI,(.5-(${y}+.5)/${size})*Math.PI,terrainSettings)-terrainSettings.sea)/(.9375-terrainSettings.sea))*terrainSettings.relief/Math.max(100,terrainSettings.relief),colors('pressure'))`);
   assert.equal(pixel.color,expected);
  }
  const draws=ctx.clears.length;h.run('render()');assert.equal(ctx.clears.length,draws);
  const before=ctx.fills.map(pixel=>pixel.color);
  h.el('terrain-randomize').onclick();
  assert.notDeepEqual(ctx.fills.map(pixel=>pixel.color),before);
  h.run('terrainSettings={...terrainSettings,relief:0};rebuildTerrain();render()');
  assert.equal(new Set(ctx.fills.map(pixel=>pixel.color)).size,1);
  assert.equal(h.el('terrain-heightmap-high').textContent,'100 m');
  h.run('terrainSettings={...ExoTerrain.defaults};rebuildTerrain();render()');
 }
});

test('resolution cancels loading and ignores assets arriving after reset',async()=>{
 const h=harness(),pending=h.run('startRun()'),load=h.loads[0];
 assert.equal(h.run('state'),'loading');assert.equal(h.el('surface-resolution').disabled,false);
 h.change('high');
 assert.equal(load.signal.aborted,true);assert.equal(h.timers.size,0);
 load.resolve({workerURL:'blob:late-engine'});await pending;
 assert.equal(h.workers.length,0);assert.ok(h.revoked.includes('blob:late-engine'));
 assert.equal(h.run('state'),'idle');assert.equal(h.run('latest'),null);
});

test('resolution clears live, paused and replay output and blocks old worker messages',async()=>{
 for(const mode of ['running','paused','replay']){
  const h=harness(),worker=await h.start();
  worker.onmessage({data:h.frame(12)});worker.onmessage({data:h.frame(24)});
  if(mode!=='running')worker.onmessage({data:{type:mode==='replay'?'complete':'paused',log:'done'}});
  if(mode==='replay'){h.run('playFrames()');assert.equal(h.intervals.size,1);}
  assert.equal(h.el('field').value,'temperature');assert.equal(h.el('surface-resolution').disabled,false);
  h.change('high');
  assert.equal(worker.terminated,true);assert.equal(h.run('state'),'idle');
  assert.equal(h.run('latest'),null);assert.equal(h.run('config'),null);assert.equal(h.run('runWorld'),null);
  assert.equal(h.run('runTerrain'),null);assert.equal(h.run('playback.all.length'),0);
  assert.equal(h.timers.size,0);assert.equal(h.intervals.size,0);assert.equal(h.run('playback.playing'),false);
  assert.equal(h.el('field').value,'surface');assert.equal(h.el('download').disabled,true);assert.equal(h.el('progress').value,0);
  assert.equal(h.el('run').disabled,false);assert.equal(h.el('terrain-controls').disabled,false);
  assert.equal(h.el('elapsed').textContent,'—');assert.equal(h.el('speed').textContent,'—');
  for(const panel of h.panels){assert.equal(panel.querySelector('input').disabled,true);assert.equal(panel.querySelector('output').textContent,'No frames');}
  worker.onmessage({data:h.frame(36)});worker.onmessage({data:{type:'complete',log:'stale'}});
  assert.equal(h.run('state'),'idle');assert.equal(h.run('latest'),null);
  const next=await h.start();assert.equal(next.messages[0].type,'start');assert.equal(h.run('state'),'running');
  h.change('low');assert.equal(next.terminated,true);assert.equal(h.run('state'),'idle');
 }
});

test('high cloud detail preserves the climate fraction in every group of four',async()=>{
 const h=harness();h.change('high');const worker=await h.start(),frame=h.frame(12);
 for(let i=0;i<2048;i++)frame.fields[2048+i]=(i%11)/10;
 const unchanged=frame.fields.slice();worker.onmessage({data:frame});
 h.el('field').value='surface';h.el('cloud-source').onclick();h.el('field').onchange();
 const layer=h.run('lastCloudLayer');assert.equal(layer.width,128);assert.equal(layer.height,64);
 for(let y=0;y<32;y++)for(let x=0;x<64;x++){
  const i=y*2*128+x*2,mean=(layer.alpha[i]+layer.alpha[i+1]+layer.alpha[i+128]+layer.alpha[i+129])/4;
  assert.ok(Math.abs(mean-frame.fields[2048+y*64+x])<1e-7);
 }
 assert.deepEqual(frame.fields,unchanged);
 h.el('field').value='cloud';h.el('field').onchange();assert.equal(h.run('lastCloudLayer'),null);
 h.change('low');
});

test('changing resolution in the atmosphere tab clears an extreme estimate and redraws on return',async()=>{
 const h=harness();
 // Select through the app's existing world/default configuration path.
 const planet=Object.keys(worlds.worlds).find(id=>worlds.climateSupport(id,worlds.worlds[id].atmosphere).mode==='surface-estimate');
 h.el('planet-type').value=planet;h.el('planet-type').onchange();await h.run('startRun()');
 assert.equal(h.run('latest.model'),'surface-estimate');h.run('showTab("atmosphere")');h.change('high');
 assert.equal(h.run('state'),'idle');assert.equal(h.run('lastTexture'),null);assert.equal(h.run('latest'),null);
 assert.equal(h.el('download').disabled,true);h.run('showTab("planet")');
 assert.deepEqual(h.el('planet').getContext().images.at(-1),[512,512]);
});

test('both display settings retain original solver fields, exports and timestep',async()=>{
 const h=harness();
 for(const preset of ['high','low']){
  h.change(preset);const worker=await h.start(),frame=h.frame(12),{cells:n,longitude,latitude}=frame.grid;
  assert.equal(worker.messages[0].resolution,'low');assert.equal(frame.dt,1800);worker.onmessage({data:frame});
  for(const field of ['surface','elevation','temperature','surfaceTemperature','cloud','pressure','wind']){
   h.el('field').value=field;h.el('field').onchange();
   assert.ok(!/NaN|undefined/.test(h.el('mean').textContent));
   assert.equal(h.run('climateTexture.getContext("2d").fills.filter(f=>f.color.startsWith("rgb(")).length'),['surface','elevation'].includes(field)?(preset==='high'?8192:2048):n);
  }
  h.run('saveJSON=(data,name)=>{globalThis.saved={data,name}}');h.el('download').onclick();
  const out=h.run('saved.data');
  assert.equal(out.grid.resolution,'low');assert.equal(out.planet_tool.display_resolution.preset,preset);assert.equal(out.grid.longitude_degrees.length,longitude);assert.equal(out.grid.latitude_degrees.length,latitude);
  assert.equal(out.grid.gaussian_weights.length,latitude);assert.equal(out.planet_tool.land_mask.length,n);assert.equal(out.planet_tool.elevation_m.length,n);
  for(const values of Object.values(out.fields))assert.equal(values.length,n);
  assert.equal(out.fields.surface_air_temperature[0],280);assert.equal(out.fields.cloud_cover.at(-1),.25);
  assert.equal(out.fields.surface_temperature.at(-1),285);assert.equal(out.fields.surface_pressure.at(-1),100000);
  assert.ok(out.port.includes('T21'));assert.match(out.namelists.plasim_namelist,/MPSTEP=30.0/);
  h.run('for(let steps=13;steps<1000;steps++)playback.push({...latest,steps})');
  assert.ok(h.run('playback.all.length')*frame.fields.byteLength<29*1024*1024);
 }
});


test('palette sprite selection, editing, file opening and saving preserve all twenty pixels',async()=>{
 const h=harness();
 h.el('palette-sprite').onkeydown({key:'End',preventDefault(){}});
 assert.equal(h.run('selectedPalettePixel'),19);
 h.el('palette-color').oninput({target:{value:'#123abc'}});
 assert.equal(h.run('surfacePalette[19]'),'#123abc');
 assert.equal(h.el('palette-hex').value,'#123ABC');
 assert.deepEqual(h.el('palette-sprite').getContext().images.at(-1),[5,4]);
 h.run('saveAsset=(bytes,name,type)=>{globalThis.savedPalette={bytes,name,type}}');h.el('palette-bmp').onclick();
 const bmp=h.run('savedPalette.bytes'),opened=palette.readPaletteBmp(bmp);
 assert.equal(opened[19],'#123abc');assert.equal(opened.length,20);
 const changed=Array.from(globalThis.ExoTerrain.palette);changed[0]='#abcdef';changed[15]='#112233';
 const bytes=palette.paletteBmp(changed);
 await h.el('palette-file').onchange({target:{files:[{name:'custom.bmp',size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer}],value:'custom.bmp'}});
 assert.deepEqual(Array.from(h.run('surfacePalette')),changed);
 assert.equal(h.run('selectedPalettePixel'),0);assert.equal(h.el('palette-color').value,'#abcdef');
 h.el('palette-xpm').onclick();assert.deepEqual(palette.readPaletteXpm(h.run('savedPalette.bytes')),changed);
 h.el('palette-hex').onchange({target:{value:'invalid'}});assert.deepEqual(Array.from(h.run('surfacePalette')),changed);
 const worker=await h.start(),frame=h.frame(12);worker.onmessage({data:frame});
 h.el('palette-color').oninput({target:{value:'#445566'}});
 assert.equal(h.run('state'),'running');assert.equal(worker.terminated,undefined);assert.equal(h.run('latest.steps'),12);
});
