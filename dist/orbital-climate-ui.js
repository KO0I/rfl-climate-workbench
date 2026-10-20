import {createClimate,advance,summarize,W,H} from './orbital-climate-core.js';
const $=id=>document.getElementById(id),ctx=$('map').getContext('2d'),pixels=ctx.createImageData(W,H);
let state,running=true,last=0;
const units={flux:' W/m²',emissivity:'',ocean:'',mixing:'×'};
function settings(){return Object.fromEntries(['flux','emissivity','ocean','mixing','seed'].map(k=>[k,Number($(k).value)]));}
function labels(){for(const k in units)$(k+'Value').textContent=$(k).value+units[k];}
function draw(){
 const layer=$('layer').value;
 for(let i=0;i<W*H;i++){
  let c;if(layer==='light'){const v=state.light[i]/2000;c=[255*v,210*v,110*v];}
  else if(layer==='cloud'){const v=state.cloud[i];c=[18+v*237,24+v*231,45+v*210];}
  else if(layer==='surface')c=state.T[i]<273.15?[221,235,251]:state.water[i]?[33,78,123]:[107,145,82];
  else{const v=Math.max(0,Math.min(1,(state.T[i]-233.15)/100));c=v<.5?[45+v*300,65+v*330,190+v*100]:[240,230-(v-.5)*390,240-(v-.5)*450];}
  if($('showClouds').checked&&['surface','temperature'].includes(layer)){const a=state.cloud[i]*.85;c=c.map((v,j)=>v*(1-a)+[242,247,255][j]*a);}
  pixels.data.set([...c.map(Math.round),255],i*4);
 }
 ctx.putImageData(pixels,0,0);const s=summarize(state);
 $('mean').textContent=s.mean.toFixed(1)+'°C';$('range').textContent=s.min.toFixed(1)+' to '+s.max.toFixed(1)+'°C';$('ice').textContent=(100*s.ice).toFixed(0)+'%';
 $('cloudMean').textContent=(100*state.cloud.reduce((a,b)=>a+b,0)/state.cloud.length).toFixed(0)+'%';
 $('elapsed').textContent=`${(state.time/86400).toFixed(1)} Earth days · ${(state.time/state.day).toFixed(1)} rotations`;
 $('legend').textContent=layer==='cloud'?'Dark 0% → white 100% cloud coverage':layer==='temperature'?'Blue −40°C · pale 10°C · red 60°C (colors saturate outside range)':layer==='light'?'Black 0 → gold 2,000 W/m²':'Blue ocean · green land · pale ice; bright cloud overlay (toggle above to inspect surface)';
 $('run').textContent=running?'Pause':'Run';
}
function reset(){state=createClimate(settings());$('status').textContent='';$('dimensions').textContent=`${state.diameter.toLocaleString()} km open diameter · ${state.width.toLocaleString()} km band · ${(state.day/3600).toFixed(2)} hour rotation at 1 g`;draw();}
function step(n){try{advance(state,n);draw();}catch(e){running=false;$('status').textContent=e.message;$('run').textContent='Run';}}
$('run').onclick=()=>{running=!running;draw();};$('step').onclick=()=>{running=false;step(Math.round(state.day/1800));};$('reset').onclick=reset;$('layer').onchange=draw;$('showClouds').onchange=draw;
for(const k in units)$(k).oninput=labels;
function suspend(){running=false;draw();}
window.climateFlightBridge={suspend};

document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
labels();reset();
function tick(t){if(running&&t-last>=100){last=t;step(24);}requestAnimationFrame(tick);}requestAnimationFrame(tick);
