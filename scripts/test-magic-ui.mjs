import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initMagicTab} from '../dist/magic-tab.js';

const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const nativeFetch=globalThis.fetch;
function harness(t){
 const images=[],workers=[],downloads=[],listeners=new Map(),els=new Map();let before=0;
 const image=(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)});
 function el(id=''){
  return {id,value:'',disabled:false,style:{},elements:[],listeners:new Map(),width:256,height:256,
   addEventListener(k,fn){this.listeners.set(k,fn);},reportValidity(){return true;},setPointerCapture(){},
   getContext(){return {createImageData:image,clearRect(){},putImageData(im){images.push([id,im.width,im.height]);}};},
   click(){downloads.push({href:this.href,name:this.download});},
  };
 }
 for(const [,id] of html.matchAll(/\bid="([^"]+)"/g))els.set(id,el(id));
 const $=id=>els.get(id);
 for(const [id,value] of Object.entries({'gas-depth':'2','gas-layer':'appearance','gas-colors':'jovian','gas-time':'0','gas-preset':'shallow'}))$(id).value=value;
 $('gas-config').elements=Object.keys(GasMagic.defaults).map(k=>$('gas-'+k)).concat($('gas-run'),$('gas-preset'));
 const doc={getElementById:$,createElement:()=>el(),addEventListener(k,fn){listeners.set(k,fn);},hidden:false};
 class Worker{constructor(){workers.push(this);}postMessage(m){this.last=m;}terminate(){this.terminated=true;}emit(m){this.onmessage({data:m});}}
 const original={document:globalThis.document,window:globalThis.window,Worker:globalThis.Worker};
 Object.assign(globalThis,{document:doc,window:{addEventListener(){}},Worker});
 t.after(()=>{for(const k of Object.keys(original))if(original[k]===undefined)delete globalThis[k];else globalThis[k]=original[k];});
 t.mock.method(globalThis,'fetch',async url=>new Response(String(url).endsWith('.wasm')?new Uint8Array([0,97,115,109,1,0,0,0]):'/* checked worker source */'));
 const api=initMagicTab({beforeRun:()=>before++});api.setActive(true);
 return {$,api,images,workers,downloads,listeners,doc,get before(){return before;}};
}
const flush=()=>new Promise(r=>setTimeout(r,20));

test('gas controls, real field rendering, replay selection and dimensioned export',async t=>{
 const h=harness(t),{$,workers}=h;
 $('gas-config').onsubmit({preventDefault(){}});await flush();assert.equal(workers.length,1);assert.equal(h.before,1);
 const w=workers[0];assert.equal(w.last.config.ra,150000);assert.ok($('gas-ra').disabled);w.emit({type:'ready'});
 const stored=JSON.parse(await readFile(new URL('../.build/magic-example.json',import.meta.url),'utf8'));
 const frame={...stored,fields:Float32Array.from(stored.fields),theta:Float32Array.from(stored.theta),radii:Float32Array.from(stored.radii)};
 w.emit({type:'frame',frame});w.emit({type:'frame',frame:{...frame,time:frame.time+0.01}});
 assert.equal(w.last.config.resolution,128);
 assert.ok(h.images.some(([id,w,h])=>id==='gas-map'&&w===768&&h===384));
 assert.ok(h.images.some(([id,w,h])=>id==='gas-globe'&&w===512&&h===512));assert.ok(!$('gas-export').disabled);
 $('gas-layer').value='east';$('gas-layer').listeners.get('input')();assert.ok($('gas-high').textContent.endsWith('ν/d'));assert.ok($('gas-colors').disabled);
 $('gas-time').value='0';$('gas-time').oninput();assert.equal($('gas-model-time').textContent,frame.time.toPrecision(4));
 $('gas-export').onclick();assert.equal(h.downloads.at(-1).name,'magic-shell-fields.json');
 // Downloaded JSON is read directly from its Blob, without a network request.
 const exported=await (await nativeFetch(h.downloads.at(-1).href)).json();
 assert.equal(exported.model,'MagIC');assert.equal(exported.longitude_degrees.length,128);assert.equal(exported.latitude_degrees.length,64);assert.equal(exported.radial_velocity.length,8192);assert.equal(exported.velocity_unit,'ν/d');
 $('gas-pause').onclick();assert.equal(w.last.paused,true);w.emit({type:'paused',paused:true});assert.equal($('gas-pause').textContent,'Resume');
 $('gas-stop').onclick();assert.ok(w.terminated);assert.ok(!$('gas-ra').disabled);assert.ok(!$('gas-export').disabled);
 w.emit({type:'error',message:'stale failure'});assert.equal(h.api.state,'stopped');
});

test('cancelled loading and late worker replies cannot replace gas fields',async t=>{
 const h=harness(t),{$}=h;const resolvers=[];
 t.mock.method(globalThis,'fetch',()=>new Promise(r=>resolvers.push(r)));
 $('gas-config').onsubmit({preventDefault(){}});assert.equal(h.api.state,'loading');$('gas-stop').onclick();
 for(const resolve of resolvers)resolve(new Response('/*late*/'));await flush();assert.equal(h.api.state,'stopped');assert.equal(h.workers.length,0);
});
