import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {initPolarStormsTab} from '../dist/polar-storms.js';
import {classifyPolarStorm,regimeFromWorld} from '../dist/storm-regime.js';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');

test('restored tab has all controls and its original hexagon default',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length,'No duplicate DOM IDs');
 assert.match(html,/id="tab-storms"[^>]+aria-controls="panel-storms"/);
 const code=readFileSync(new URL('../dist/polar-storms.js',import.meta.url),'utf8');
 for(const m of code.matchAll(/\$\('(storms-[^']+)'\)/g))assert.ok(ids.includes(m[1]),m[1]);
 assert.equal(classifyPolarStorm(10**-1.61,10**-4.72).m,6);
 const saturn=regimeFromWorld({rotationHours:10.7,planetRadius:60330000,jetSpeed:100,jetRadiusDeg:12,eddyViscosity:1e6});
 assert.equal(classifyPolarStorm(saturn.Ro,saturn.E).m,6);
});

function harness(t){
 const nodes=new Map(),frames=new Map();let next=0,draws=0;
 const ctx=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createRadialGradient:()=>({addColorStop(){}})}, {get:(obj,key)=>obj[key]??((...args)=>{for(const a of args)if(typeof a==='number')assert.ok(Number.isFinite(a),key+' finite');draws++;})});
 function node(id,value='') {return {id,value,hidden:false,attrs:{},style:{},textContent:'',listeners:{},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];},addEventListener(k,fn){this.listeners[k]=fn;},getContext:()=>ctx,querySelector:()=>nodes.get('storms-marker'),getBoundingClientRect:()=>({left:0,top:0,width:560,height:420}),setPointerCapture(){}};}
 for(const m of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g))nodes.set(m[1],node(m[1],/\bvalue="([^"]+)"/.exec(m[0])?.[1]||''));
 nodes.set('storms-marker',node('storms-marker'));
 const $=id=>{assert.ok(nodes.has(id),id+' exists');return nodes.get(id);};
 const saved={};for(const k of ['document','window','requestAnimationFrame','cancelAnimationFrame','matchMedia'])saved[k]=globalThis[k];
 Object.assign(globalThis,{document:{getElementById:$,addEventListener(){},hidden:false},window:{addEventListener(){}},requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id),matchMedia:()=>({matches:false})});
 t.after(()=>{for(const [k,v] of Object.entries(saved))if(v===undefined)delete globalThis[k];else globalThis[k]=v;});
 const api=initPolarStormsTab();
 return {$,api,frames,get draws(){return draws;},step(now){const pending=[...frames.values()];frames.clear();for(const f of pending)f(now);}};
}

test('controls, both renderers and animation lifecycle work after restoration',t=>{
 const h=harness(t),{$}=h;h.api.setActive(true);
 for(let i=0;i<8;i++)h.step(100+i*40);
 assert.ok(h.draws>100);assert.match($('storms-caption').textContent,/hexagon/);
 $('storms-view-bands').onclick();h.step(500);assert.equal($('storms-view-bands').attrs['aria-pressed'],'true');
 $('storms-e').value=-3;$('storms-e').oninput();$('storms-ro').value=-2.6;$('storms-ro').oninput();
 assert.match($('storms-caption').textContent,/stable/);h.step(650);
 $('storms-e').value=-6;$('storms-e').oninput();$('storms-ro').value=0;$('storms-ro').oninput();
 assert.match($('storms-caption').textContent,/chaotic/);assert.equal($('storms-warning').hidden,false);h.step(800);
 $('storms-saturn').onclick();assert.match($('storms-caption').textContent,/hexagon/);
 $('storms-view-dye').onclick();$('storms-dye-color').value='heatmap';$('storms-dye-color').onchange();h.step(950);
 $('storms-pause').onclick();h.step(1000);assert.equal(h.frames.size,0);
 $('storms-globe-south').onclick();$('storms-globe-north').onclick();
 $('storms-pause').onclick();assert.ok(h.frames.size);h.api.setActive(false);assert.equal(h.frames.size,0);
});

test('main navigation activates storms and preserves all existing tabs',()=>{
 const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',style:{},setAttribute(){}});return nodes.get(id);};
 const tabs=[...html.matchAll(/<button id="tab-([^"]+)"[^>]*aria-controls="([^"]+)"/g)].map(m=>({id:'tab-'+m[1],setAttribute(){},getAttribute:()=>m[2]}));
 let storms=false;
 const context={$ ,activeTab:'climate',updateSurfaceFlow(){},syncGasMode(){},stormsTab:{setActive:v=>storms=v},airlessTab:{setActive(){}},updateResolutionNote(){},render(){},surfaceProfiles:{},selection:{planet:'temperate'},orbitalFrame:{contentWindow:{}},document:{querySelector:()=>$('workspace'),querySelectorAll:()=>tabs}};
 const source=app.slice(app.indexOf('function showTab(name){'),app.indexOf('\nconst tabs=[',app.indexOf('function showTab(name){')));
 runInNewContext(source+'\nshowTab("storms");',context);
 assert.equal(storms,true);assert.equal($('panel-storms').hidden,false);assert.equal($('storms-settings').hidden,false);assert.equal($('rocky-settings').hidden,true);assert.match($('model-resolution').textContent,/laboratory/);
 runInNewContext('showTab("climate");',context);assert.equal(storms,false);assert.equal($('storms-settings').hidden,true);assert.equal($('rocky-settings').hidden,false);
 for(const id of ['tab-climate','tab-planet','tab-atmosphere','tab-orbital','tab-gas'])assert.ok(tabs.some(t=>t.id===id));
});

test('cloud pack button bakes a visible four-deck snapshot and settings invalidate it',async t=>{
 const h=harness(t),{$}=h;
 await $('storms-cloud-build').onclick();
 assert.equal($('storms-cloud-download').disabled,false);assert.equal($('storms-cloud-preview').hidden,false);
 assert.match($('storms-cloud-status').textContent,/four 128 × 64 cloud decks/);
 $('storms-cloud-layer').value='3';$('storms-cloud-layer').onchange();assert.match($('storms-cloud-preview').attrs['aria-label'],/Deep clouds/);
 $('storms-ro').value='-1.2';$('storms-ro').oninput();assert.equal($('storms-cloud-download').disabled,true);assert.equal($('storms-cloud-preview').hidden,true);
 h.api.setActive(false);
});
