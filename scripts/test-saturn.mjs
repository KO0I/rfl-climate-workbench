import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SATURN_LAYERS,makeLayerConfigs,readDroneXpm} from '../dist/saturn-layers.js';
import {makeGeometry,paintSaturn} from '../dist/saturn-renderer.js';
import {createCoordinates,paintLayer,polarBoundary} from '../dist/saturn-model.js';
import {initSaturnTab} from '../dist/saturn-tab.js';
import {JUPITER_LAYERS,makeJupiterConfigs} from '../dist/jupiter-layers.js';
import {paintJupiterLayer,jupiterLayerSample} from '../dist/jupiter-model.js';
import {jupiterJetSpeed,prepareJupiterCloudTop} from '../dist/jupiter-clouds.js';
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const source=await readFile(new URL('../dist/saturn-neutral-drone.xpm',import.meta.url),'utf8');
const configs=makeLayerConfigs(),coords=createCoordinates(128,64);
const textures=configs.map((c,j)=>{const im={width:128,height:64,data:new Uint8ClampedArray(128*64*4)};if(j<4)paintLayer(im,coords,0,j,c);return im;});

test('closed shells occlude interiors; open section walls and peeled layers reveal them',()=>{
 const closed=makeGeometry(192,168,{opening:0,rings:false});
 const solid=paintSaturn(closed,textures,configs);
 assert.ok(solid.owner.includes(0));assert.ok(!solid.owner.includes(1));assert.ok(!solid.owner.includes(4));
 const opened=makeGeometry(192,168,{rings:false});
 const cut=paintSaturn(opened,textures,configs);
 for(let i=0;i<5;i++)assert.ok(cut.owner.includes(i),'Layer '+i+' visible in cutaway');
 assert.ok(opened.layers[0].face.includes(1),'Section planes are rendered');
 const middle=makeGeometry(192,168,{rings:false,removed:[1,1,0,0,0]});
 const peeled=paintSaturn(middle,textures,configs);
 assert.ok(!peeled.owner.includes(0));assert.ok(!peeled.owner.includes(1));assert.ok(peeled.owner.includes(2));
 const fullCore=paintSaturn(makeGeometry(192,168,{rings:false,removed:[1,1,1,1,0]}),textures,configs);
 assert.ok(fullCore.owner.includes(4));for(let i=0;i<4;i++)assert.ok(!fullCore.owner.includes(i));
 assert.notDeepEqual(cut.data,paintSaturn(makeGeometry(192,168,{yaw:1.2,pitch:.6,rings:false}),textures,configs).data,'Cutaway rotates in three dimensions');
});

test('XPM geometry and reused optics produce responsive glass and mirror materials',()=>{
 const drone=readDroneXpm(source);assert.equal(drone.ratio,12/26);
 for(const key of ['ior','scatter','dispersion','absorption'])assert.equal(configs[3][key],drone[key]);
 const geo=makeGeometry(128,112,{rings:false,opening:0,removed:[1,1,1,0,0]}),base=paintSaturn(geo,textures,configs).data;
 for(const [key,value] of [['ior',1],['scatter',.9],['dispersion',0],['absorption',.8],['reflection',1],['cloudOpacity',.9]]){
  const changed=makeLayerConfigs();changed[3][key]=value;
  assert.notDeepEqual(paintSaturn(geo,textures,changed).data,base,key+' changes glass');
 }
 const core=makeGeometry(128,112,{rings:false,removed:[1,1,1,1,0]});
 const normal=paintSaturn(core,textures,configs).data,changed=makeLayerConfigs();changed[4].reflection=0;
 assert.notDeepEqual(paintSaturn(core,textures,changed).data,normal);
 assert.notDeepEqual(paintSaturn(core,textures,configs,{environment:'space'}).data,normal);
});

test('both polygon waves and distinct flowing textures continue through water ice',()=>{
 for(const north of [true,false]){
  const sides=north?6:10;
  assert.ok(Math.abs(polarBoundary(.17,north,0)-polarBoundary(.17+2*Math.PI/sides,north,0))<1e-10);
 }
 for(let j=0;j<4;j++){
  const im={width:128,height:64,data:new Uint8ClampedArray(128*64*4)};
  paintLayer(im,coords,0,j,{...configs[j],wave:0});assert.notDeepEqual(im.data,textures[j].data,'Wave exists in '+SATURN_LAYERS[j].name);
  paintLayer(im,coords,3,j,configs[j]);assert.notDeepEqual(im.data,textures[j].data,'Clouds flow in '+SATURN_LAYERS[j].name);
 }
});

// A DOM adapter tests the real controller without starting a browser or server.
function harness(t,reduced=true){
 const elements=new Map(),frames=new Map(),images=new Map(),events=new Map();let next=0,now=0;
 function parse(markup){const result=[];for(const match of markup.matchAll(/<(input|select|button|output|div|canvas|label|span|h[123]|p)\b([^>]*)>/g)){
  const attrs=Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
  if(!attrs.id&&!attrs['data-layer'])continue;
  const node=element(attrs.id||'');node.tag=match[1];node.value=attrs.value||'';node.type=attrs.type||'';node.dataset={setting:attrs['data-setting'],layer:attrs['data-layer']};
  node.disabled=/\bdisabled\b/.test(match[2]);node.hidden=/\bhidden\b/.test(match[2]);node.attrs=attrs;
  if(attrs.id)elements.set(attrs.id,node);result.push(node);
 }return result;}
 function element(id){return {id,attrs:{},listeners:new Map(),dataset:{},style:{},value:'',width:256,height:256,children:[],textContent:'',
  get innerHTML(){return this.markup||'';},
  set innerHTML(value){this.markup=value;for(const c of this.children)if(c.id)elements.delete(c.id);this.children=parse(value);},
  querySelectorAll(selector){return this.children.filter(c=>selector==='button'?c.tag==='button':c.dataset.setting);},
  addEventListener(type,fn){this.listeners.set(type,fn);},setAttribute(k,v){this.attrs[k]=v;},setPointerCapture(){},
  getContext(){return {createImageData:(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)}),putImageData:im=>images.set(id,im.data.slice())};}};}
 parse(html);const $=id=>elements.get(id);
 const doc={getElementById:$,addEventListener:(k,v)=>events.set(k,v),hidden:false};
 const names=['document','window','matchMedia','requestAnimationFrame','cancelAnimationFrame','fetch'],original=Object.fromEntries(names.map(n=>[n,globalThis[n]]));
 Object.assign(globalThis,{document:doc,window:{addEventListener(){}},matchMedia:()=>({matches:reduced}),requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id),fetch:async()=>new Response(source)});
 t.after(()=>{for(const n of names)if(original[n]===undefined)delete globalThis[n];else globalThis[n]=original[n];});
 const api=initSaturnTab();
 return {$,api,images,doc,events,frames,step(){now+=200;const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(now);}};
}
test('layer controls swap, edits survive restoration, and inactive views stop drawing',async t=>{
 const h=harness(t),{$}=h;h.api.setActive(true);await Promise.resolve();h.step();
 assert.equal($('saturn-current-layer').textContent,'Stratospheric haze');assert.ok($('saturn-restore').disabled);
 $('saturn-color').value='#aabbcc';$('saturn-color').listeners.get('input')();
 $('saturn-layer').value='3';$('saturn-layer').onchange();h.step();
 assert.equal($('saturn-current-layer').textContent,'Water ice');assert.ok($('saturn-ior'));assert.ok(!$('saturn-palette'));
 assert.ok(!$('saturn-poles').hidden);assert.match($('saturn-north').attrs['aria-label'],/Water ice/);
 $('saturn-peel').onclick();h.step();assert.equal($('saturn-current-layer').textContent,'Metallic hydrogen');assert.ok($('saturn-peel').disabled);assert.ok($('saturn-poles').hidden);assert.ok(!$('saturn-ior'));assert.ok($('saturn-reflection'));
 $('saturn-layer').value='0';$('saturn-layer').onchange();assert.equal($('saturn-color').value,'#aabbcc');
 $('saturn-reset-layer').onclick();assert.equal($('saturn-color').value,configs[0].color);
 h.api.setActive(false);assert.equal(h.frames.size,0);h.api.setActive(true);assert.ok(h.frames.size>0);
 h.doc.hidden=true;h.events.get('visibilitychange')();assert.equal(h.frames.size,0);h.api.setActive(false);
});

test('animated removal and restoration return to the exact paused scene',t=>{
 const h=harness(t,false),{$}=h;$('saturn-pause').onclick();h.api.setActive(true);h.step();
 const first=h.images.get('saturn-globe');$('saturn-peel').onclick();
 for(let i=0;i<9;i++)h.step();assert.equal($('saturn-current-layer').textContent,'Ammonia ice');assert.equal($('saturn-state').textContent,'Paused');
 assert.notDeepEqual(h.images.get('saturn-globe'),first);
 $('saturn-restore').onclick();for(let i=0;i<9;i++)h.step();assert.deepEqual(h.images.get('saturn-globe'),first);
 assert.equal(h.frames.size,0);h.api.setActive(false);
});

const jovian=makeJupiterConfigs(),jupiterTextures=jovian.map((c,j)=>{
 const im={width:128,height:64,data:new Uint8ClampedArray(128*64*4)};
 if(j<5)paintJupiterLayer(im,coords,0,j,c);return im;
});
test('Jupiter reveals all six layers and keeps internal emission behind opaque clouds',()=>{
 const options={rings:false,layerDefinitions:JUPITER_LAYERS};
 const cut=paintSaturn(makeGeometry(192,168,options),jupiterTextures,jovian);
 for(let j=0;j<6;j++)assert.ok(cut.owner.includes(j),'Visible Jupiter layer '+j);
 const dark=makeJupiterConfigs();dark[5].emission=0;
 const closed=makeGeometry(192,168,{...options,opening:0});
 assert.deepEqual(paintSaturn(closed,jupiterTextures,jovian).data,paintSaturn(closed,jupiterTextures,dark).data,'Closed clouds occlude all core glow');
 const core=paintSaturn(makeGeometry(192,168,{...options,removed:[1,1,1,1,1,0]}),jupiterTextures,jovian);
 assert.deepEqual([...new Set(core.owner)].sort(),[-1,5]);
});

test('maximum-refraction blue-green glass transmits a red-orange glow at midpoint scattering',()=>{
 const geometry=makeGeometry(192,168,{rings:false,opening:0,removed:[1,1,1,0,0,0],layerDefinitions:JUPITER_LAYERS});
 const bright=paintSaturn(geometry,jupiterTextures,jovian),dark=makeJupiterConfigs();dark[5].emission=0;
 const unlit=paintSaturn(geometry,jupiterTextures,dark);
 const center=[0,0,0],rim=[0,0,0],off=[0,0,0];let centers=0,rims=0;
 for(let p=0;p<bright.owner.length;p++){
  const r=Math.hypot(geometry.nx[p],geometry.ny[p]);
  if(r<.14){for(let k=0;k<3;k++){center[k]+=bright.data[p*4+k];off[k]+=unlit.data[p*4+k];}centers++;}
  if(r>.53&&r<.58){for(let k=0;k<3;k++)rim[k]+=bright.data[p*4+k];rims++;}
 }
 assert.equal(jovian[3].ior,2.5);assert.equal(jovian[3].scatter,.5);
 assert.ok(center[0]/centers>190,'Core remains luminous through glass');
 assert.ok(center[0]>center[1]*1.3&&center[1]>center[2]*1.3,'Transmitted glow is red-orange');
 assert.ok((center[0]-off[0])/centers>60,'Turning glow off visibly removes emission');
 assert.ok(rim[1]>rim[0]*1.2&&rim[2]>rim[0]*1.2,'Outer shell stays blue-green');
 for(const [key,value] of [['ior',1],['scatter',0],['absorption',.8]]){
  const changed=makeJupiterConfigs();changed[3][key]=value;
  assert.notDeepEqual(bright.data,paintSaturn(geometry,jupiterTextures,changed).data,key+' changes transmitted light');
 }
});

test('Jupiter cloud layers animate seamlessly and have independent Great Red Spot controls',()=>{
 for(let j=0;j<5;j++){
  const changed={width:128,height:64,data:new Uint8ClampedArray(128*64*4)};
  paintJupiterLayer(changed,coords,3,j,jovian[j]);assert.notDeepEqual(changed.data,jupiterTextures[j].data);
 }
 const c={...jovian[1],primary:[246,230,201],secondary:[166,91,56]};
 for(const lat of [-1.4,-.38,0,1.4]){
  const a=jupiterLayerSample(-Math.PI,lat,2,1,c),b=jupiterLayerSample(Math.PI,lat,2,1,c);
  a.forEach((v,k)=>assert.ok(Math.abs(v-b[k])<1e-8,'Continuous longitude seam'));
 }
 assert.notDeepEqual(jupiterLayerSample(.38,-22*Math.PI/180,0,1,c),jupiterLayerSample(.38,-22*Math.PI/180,0,1,{...c,storm:0}));
});

test('Jupiter cloud tops wrap, freeze, retain detail over time and respond to appearance controls',()=>{
 const defaults=jovian[0],c=prepareJupiterCloudTop({...defaults,primary:[230,230,223],secondary:[150,114,83]});
 assert.ok(jupiterJetSpeed(8*Math.PI/180)>0&&jupiterJetSpeed(17*Math.PI/180)<0,'Neighboring jets counterflow');
 for(const time of [0,7.999,8,16,789,3600])for(const lat of [-1.4,-.38,0,.3,1.4]){
  const a=jupiterLayerSample(-Math.PI,lat,time,0,c),b=jupiterLayerSample(Math.PI,lat,time,0,c);
  a.forEach((v,k)=>assert.ok(Number.isFinite(v)&&Math.abs(v-b[k])<1e-7,'Cloud and storm longitude seam stays continuous'));
 }
 for(const lon of [-2,.38,2])for(const lat of [-.7,-22*Math.PI/180,.3]){
  assert.deepEqual(jupiterLayerSample(lon,lat,0,0,{...c,flow:0}),jupiterLayerSample(lon,lat,40,0,{...c,flow:0}),'Zero flow freezes clouds, storm and poles');
  const before=jupiterLayerSample(lon,lat,8-1e-5,0,c),after=jupiterLayerSample(lon,lat,8+1e-5,0,c);
  before.forEach((v,k)=>assert.ok(Math.abs(v-after[k])<.02,'Advection renewal does not jump'));
 }
 const im={width:128,height:64,data:new Uint8ClampedArray(128*64*4)};
 for(const [key,value] of [['detail',0],['turbulence',0],['pattern','cells'],['color','#88aaee'],['accent','#552299'],['storm',0],['wave',0],['palette','thermal']]){
  paintJupiterLayer(im,coords,0,0,{...defaults,[key]:value});
  assert.notDeepEqual(im.data,jupiterTextures[0].data,key+' changes the upper layer');
 }
});

test('switching Jupiter and Saturn preserves each layer, material, and camera state',t=>{
 const h=harness(t),{$}=h;h.api.setActive(true);h.step();
 $('saturn-color').value='#aabbcc';$('saturn-color').listeners.get('input')();
 h.api.setPreset('jupiter');h.step();
 assert.match($('gas-object-name').textContent,/JUPITER/);assert.match($('saturn-layer-number').textContent,/6$/);
 assert.equal($('saturn-layer-list').querySelectorAll('button').length,6);assert.ok($('saturn-rings').hidden);
 $('saturn-layer').value='3';$('saturn-layer').onchange();h.step();
 assert.equal(Number($('saturn-ior').value),Number($('saturn-ior').attrs.max));
 assert.equal(Number($('saturn-scatter').value),.5);assert.equal($('saturn-color').value,'#26b6b0');
 assert.ok($('saturn-emission'));assert.match($('saturn-north').attrs['aria-label'],/eight cyclones/);
 $('saturn-color').value='#18c7bf';$('saturn-color').listeners.get('input')();
 $('saturn-emission').value='1.8';$('saturn-emission').listeners.get('input')();
 $('saturn-zoom').value='1.5';$('saturn-zoom').oninput();h.step();const before=h.images.get('saturn-globe');
 h.api.setPreset('saturn');h.step();
 assert.equal($('saturn-color').value,'#aabbcc');assert.ok(!$('saturn-rings').hidden);assert.ok(!$('saturn-emission'));
 $('saturn-layer').value='3';$('saturn-layer').onchange();
 assert.equal(Number($('saturn-ior').value),1.5);assert.equal(Number($('saturn-scatter').value),.15);
 h.api.setPreset('jupiter');h.step();
 assert.equal($('saturn-layer').value,'3');assert.equal($('saturn-color').value,'#18c7bf');assert.equal(Number($('saturn-emission').value),1.8);
 assert.equal(Number($('saturn-zoom').value),1.5);assert.deepEqual(h.images.get('saturn-globe'),before);
 $('saturn-peel').onclick();h.step();assert.equal($('saturn-current-layer').textContent,'Molecular hydrogen & helium');assert.ok($('saturn-opacity'));assert.ok($('saturn-poles').hidden);
 $('saturn-peel').onclick();h.step();assert.equal($('saturn-current-layer').textContent,'Metallic hydrogen');assert.ok($('saturn-peel').disabled);assert.ok($('saturn-emission'));
 $('saturn-restore').onclick();h.step();$('saturn-restore').onclick();h.step();assert.deepEqual(h.images.get('saturn-globe'),before);
 $('saturn-neutral').onclick();assert.equal($('saturn-color').value,'#26b6b0');assert.equal(Number($('saturn-emission').value),1.2);assert.equal(Number($('saturn-scatter').value),.5);
 $('saturn-reset').onclick();h.step();assert.equal($('saturn-layer').value,'0');assert.equal($('saturn-rings').attrs['aria-pressed'],'false');
 h.api.setPreset('saturn');assert.equal($('saturn-layer').value,'3');$('saturn-layer').value='0';$('saturn-layer').onchange();assert.equal($('saturn-color').value,'#aabbcc');
 h.api.setActive(false);assert.equal(h.frames.size,0);
});
