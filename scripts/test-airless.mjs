import test from 'node:test';
import assert from 'node:assert/strict';
import {airlessDefaults,airlessPresets,generateAirless,createAirlessModel} from '../dist/airless-model.js';
import {faceDirection} from '../dist/planet-tool/cubemap.js';
import {initAirlessTab} from '../dist/airless-tab.js';

test('airless terrain is deterministic, finite, seam-consistent and handles flat terrain',()=>{
 const settings={...airlessDefaults,resolution:128},a=generateAirless(settings),b=generateAirless(settings);
 assert.deepEqual(a.heights,b.heights);assert(a.min<a.max);assert(a.heights.every(Number.isFinite));
 assert.notDeepEqual(a.heights,generateAirless({...settings,seed:123}).heights);
 const model=createAirlessModel(settings);
 for(let i=0;i<=32;i++){
  const v=i/16-1;
  assert.equal(model.sample(...faceDirection('pz',1,v)),model.sample(...faceDirection('px',-1,v)));
  assert.equal(model.sample(...faceDirection('pz',v,-1)),model.sample(...faceDirection('py',v,1)));
 }
 for(const s of Object.values(airlessPresets))assert.equal(createAirlessModel(s).craters.length,s.density);
 assert(generateAirless({...settings,density:0,roughness:0}).heights.every(v=>v===0));
 assert.throws(()=>createAirlessModel({...settings,seed:-1}));
});

test('airless UI generates only terrain, draws, rotates, invalidates stale exports and cancels',t=>{
 const els=new Map(),workers=[],images=new Map();
 function element(id=''){
  const e={id,value:'',style:{},listeners:{},disabled:false,hidden:false,width:320,height:320,
   setAttribute(){},append(c){if(c.id)els.set(c.id,c);},insertBefore(c){this.append(c);},
   addEventListener(type,cb){this.listeners[type]=cb;},reportValidity(){return true;},setPointerCapture(){},
   getContext(){return {createImageData:(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)}),putImageData:im=>images.set(e.id,{...im,data:im.data.slice()})};}
  };
  Object.defineProperty(e,'innerHTML',{set(html){
   for(const tag of html.matchAll(/<(input|select|canvas|button|form|fieldset|output|p|span)[^>]*\bid="([^"]+)"[^>]*>/g)){
    const child=element(tag[2]);child.value=tag[0].match(/\bvalue="([^"]*)"/)?.[1]||'';els.set(child.id,child);
   }
   for(const select of html.matchAll(/<select[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)){
    const options=[...select[2].matchAll(/<option\s+value="([^"]+)"([^>]*)>/g)];els.get(select[1]).value=(options.find(x=>x[2].includes('selected'))||options[0])[1];
   }
  }});
  return e;
 }
 const containers=new Map(['main','.workspace','.workspace-nav .tabs'].map(k=>[k,element()]));
 els.set('model-resolution',element('model-resolution'));
 class Worker{constructor(url){this.url=String(url);workers.push(this);}postMessage(message){this.message=message;}terminate(){this.terminated=true;}emit(data){this.onmessage({data});}}
 const before={document:globalThis.document,window:globalThis.window,Worker:globalThis.Worker};
 globalThis.document={head:element(),body:{classList:{toggle(){}}},getElementById:id=>els.get(id),querySelector:s=>containers.get(s),createElement:()=>element()};
 globalThis.window={addEventListener(){}};globalThis.Worker=Worker;
 t.after(()=>{for(const [key,value] of Object.entries(before))if(value===undefined)delete globalThis[key];else globalThis[key]=value;});
 const api=initAirlessTab();api.setActive(true);
 assert.equal(workers.length,1);assert.match(workers[0].url,/airless-worker\.js$/);assert.equal(workers[0].message.type,'terrain');
 const result=generateAirless({...workers[0].message.settings,resolution:128});workers[0].emit({type:'terrain',...result});
 assert.equal(els.get('airless-json').disabled,false);assert.match(els.get('airless-status').textContent,/No climate/);
 assert.equal(images.get('airless-map').width,256);const frame=images.get('airless-globe').data;
 els.get('airless-globe').onkeydown({key:'ArrowLeft',preventDefault(){}});assert.notDeepEqual(frame,images.get('airless-globe').data);
 els.get('airless-density').value=400;els.get('airless-controls').listeners.input();assert(els.get('airless-json').disabled);
 els.get('airless-form').onsubmit({preventDefault(){}});assert.equal(workers.length,2);
 els.get('airless-cancel').onclick();assert(workers[1].terminated);assert(els.get('airless-json').disabled);
 api.setActive(false);assert(els.get('airless-settings').hidden);
});
