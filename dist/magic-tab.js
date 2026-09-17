import './magic-model.js';
import {Globe} from './planet-tool/globe.js';
import {errorMessage} from './engine-loader.js';
const $=id=>document.getElementById(id);
const base=new URL('./',import.meta.url),keys=Object.keys(GasMagic.defaults);
const colors={jovian:['#352c43','#8a493b','#ba8353','#e0bd84','#fff0ce'],saturn:['#605446','#af9464','#d4be8a','#eee0b5','#fff7df'],neptune:['#132950','#225990','#348fb4','#89cbda','#d7f5ec'],signed:['#273c83','#499fc7','#e4e9df','#d99254','#942e40'],speed:['#13243d','#286b94','#7dcbc2','#eddf8f','#e97742']};
export function initMagicTab({beforeRun=()=>{}}={}){
 const globe=new Globe($('gas-globe')),ctx=$('gas-map').getContext('2d');
 const mapWidth=768,mapHeight=384;
 $('gas-map').width=mapWidth;$('gas-map').height=mapHeight;globe.setSize(512);
 let worker=null,pending=null,url=null,timer=null,startup=null,state='idle',frames=[],index=0,follow=true,active=false,texture=null,runConfig=null;
 function getConfig(){return GasMagic.validate(Object.fromEntries(keys.map(k=>[k,Number($('gas-'+k).value)])));}
 function setConfig(c){for(const k of keys)$('gas-'+k).value=c[k];labels();}
 function labels(){$('gas-strat-value').textContent=Number($('gas-strat').value).toFixed(1);$('gas-radratio-value').textContent=Number($('gas-radratio').value).toFixed(2);}
 function setState(next){
  state=next;const busy=['loading','running','paused'].includes(state);
  for(const e of $('gas-config').elements)e.disabled=busy;
  $('gas-pause').disabled=!['running','paused'].includes(state);$('gas-pause').textContent=state==='paused'?'Resume':'Pause';$('gas-stop').disabled=!busy;
  $('gas-state').textContent={idle:'Ready',loading:'Loading',running:'Running locally',paused:'Paused',complete:'Run complete',stopped:'Stopped',error:'Run stopped'}[state];
 }
 function cleanup(){clearTimeout(startup);pending?.abort();pending=null;worker?.terminate();worker=null;if(url)URL.revokeObjectURL(url);url=null;}
 function stopReplay(){clearInterval(timer);timer=null;$('gas-play').textContent='Play replay';}
 function fail(e){cleanup();setState('error');$('gas-status').textContent=errorMessage(e,'MagIC stopped unexpectedly. Try a shorter run or gentler settings.');}
 async function asset(name,binary,signal){
  const r=await fetch(new URL(name,base),{credentials:'same-origin',signal});
  if(!r.ok)throw new Error(`Could not load MagIC (HTTP ${r.status}). Reopen the site and try again.`);
  if(/html/i.test(r.headers.get('content-type')||''))throw new Error('MagIC received a sign-in page. Reopen this site and try again.');
  if(!binary){const s=await r.text();if(!s.trim()||/^\s*</.test(s))throw new Error('An engine script did not load correctly. Reload and try again.');return s;}
  const b=await r.arrayBuffer();if(b.byteLength<8)throw new Error('Incomplete MagIC download.');return b;
 }
 async function start(){
  if(!['idle','complete','stopped','error'].includes(state))return;
  if(!$('gas-config').reportValidity())return;
  const c=getConfig();beforeRun();cleanup();stopReplay();frames=[];index=0;follow=true;runConfig=c;syncFrames();
  setState('loading');$('gas-status').textContent='Loading the MagIC solver…';$('gas-log').textContent='Loading MagIC.';$('gas-progress').value=0;
  const controller=new AbortController();pending=controller;
  startup=setTimeout(()=>{if(pending===controller)fail(new Error('MagIC loading timed out. Check your connection and try again.'));},120000);
  try{
   if(typeof Worker!=='function'||typeof WebAssembly!=='object')throw new Error('This browser needs WebAssembly and background workers to run MagIC.');
   const [model,engine,source,wasmBinary]=await Promise.all([asset('magic-model.js',false,controller.signal),asset('magic-engine.js',false,controller.signal),asset('magic-worker.js',false,controller.signal),asset('magic-engine.wasm',true,controller.signal)]);
   if(pending!==controller)return;
   const h=new Uint8Array(wasmBinary,0,4);if(h[0]!==0||h[1]!==97||h[2]!==115||h[3]!==109)throw new Error('MagIC engine download is damaged. Reload and try again.');
   url=URL.createObjectURL(new Blob([model,'\n;\n',engine,'\n;\n',source],{type:'text/javascript'}));
   worker=new Worker(url,{name:'MagIC gas-shell solver'});
   worker.onmessage=({data:d})=>{
    if(pending!==controller)return;
    if(d.type==='ready'){clearTimeout(startup);setState('running');$('gas-status').textContent='Computing rotating convection on this device.';}
    if(d.type==='progress'){$('gas-progress').value=d.step/d.total;$('gas-status').textContent=`${d.step.toLocaleString()} / ${d.total.toLocaleString()} steps${state==='paused'?' · paused':''}`;}
    if(d.type==='paused')setState(d.paused?'paused':'running');
    if(d.type==='frame'){
     frames.push(d.frame);if(frames.length>32){frames.splice(1,1);if(index>1)index--;}
     if(follow)index=frames.length-1;syncFrames();if(active)render();
    }
    if(d.type==='complete'){cleanup();setState('complete');$('gas-progress').value=1;$('gas-status').textContent=`MagIC completed ${c.steps.toLocaleString()} steps. Replay or export the results.`;$('gas-log').textContent=d.log;}
    if(d.type==='error'){$('gas-log').textContent=d.log||d.message;fail(d.message);}
   };
   worker.onerror=e=>{e.preventDefault?.();fail(e);};worker.onmessageerror=()=>fail(new Error('MagIC returned an unreadable result. Try again.'));
   worker.postMessage({type:'start',config:c,wasmBinary},[wasmBinary]);
  }catch(e){if(pending===controller)fail(e);}
 }
 function syncFrames(){
  const f=frames[index];$('gas-empty').hidden=Boolean(f);
  for(const id of ['gas-depth','gas-export','gas-latest'])$(id).disabled=!f;
  for(const id of ['gas-play','gas-time'])$(id).disabled=frames.length<2;
  $('gas-time').max=Math.max(0,frames.length-1);$('gas-time').value=index;
  $('gas-time-value').textContent=f?`${index+1} / ${frames.length}${follow?' · latest':''}`:'No frames';
  if(f){$('gas-depth').max=f.levels-1;if(Number($('gas-depth').value)>=f.levels)$('gas-depth').value=2;}
  else{texture=null;ctx.clearRect(0,0,mapWidth,mapHeight);globe.ctx.clearRect(0,0,globe.size,globe.size);for(const id of ['gas-rotations','gas-model-time','gas-grid','gas-low','gas-high'])$(id).textContent='—';}
 }
 function render(){
  const frame=frames[index];if(!frame)return;
  const level=Number($('gas-depth').value),data=GasMagic.shell(frame,level),layer=$('gas-layer').value;
  const appearance=layer==='appearance',ramp=colors[appearance?$('gas-colors').value:layer==='speed'?'speed':'signed'];
  const values=new Float32Array(frame.width*frame.rows);let max=0;
  for(let j=0;j<values.length;j++){
   const v=layer==='east'?data.east[j]:layer==='radial'?data.radial[j]:layer==='speed'?Math.hypot(data.east[j],data.south[j],data.radial[j]):data.entropy[j]-data.mean;
   values[j]=v;max=Math.max(max,Math.abs(v));
  }
  max=Math.max(max,1e-12);const lo=layer==='speed'?0:-max,hi=max;
  const rgb=ramp.map(c=>[1,3,5].map(k=>parseInt(c.slice(k,k+2),16)));
  const im=ctx.createImageData(mapWidth,mapHeight),out=im.data;
  for(let y=0;y<mapHeight;y++){
   const theta=(y+.5)/mapHeight*Math.PI;let row=0;for(let k=1;k<frame.rows;k++)if(Math.abs(frame.theta[k]-theta)<Math.abs(frame.theta[row]-theta))row=k;
   for(let x=0;x<mapWidth;x++){
    // The first MagIC longitude is 0; map labels run from -180 to +180.
    const col=(Math.floor(x/mapWidth*frame.width)+frame.width/2)%frame.width,v=values[col*frame.rows+row];
    const t=Math.max(0,Math.min(1,(v-lo)/(hi-lo)))*(ramp.length-1),a=Math.min(ramp.length-2,Math.floor(t)),f=t-a,j=(y*mapWidth+x)*4;
    for(let k=0;k<3;k++)out[j+k]=rgb[a][k]+(rgb[a+1][k]-rgb[a][k])*f;out[j+3]=255;
   }
  }
  texture=im;ctx.putImageData(im,0,0);globe.draw(im,!appearance);
  $('gas-depth-value').textContent=`r / rₒ = ${data.radius.toFixed(3)} · level ${level+1} of ${frame.levels}`;
  $('gas-gradient').style.background=`linear-gradient(90deg,${ramp.join(',')})`;
  const fmt=v=>Math.abs(v)<.001||Math.abs(v)>9999?v.toExponential(2):v.toPrecision(3),unit=['appearance','entropy'].includes(layer)?'':' ν/d';
  $('gas-low').textContent=fmt(lo)+unit;$('gas-high').textContent=fmt(hi)+unit;
  $('gas-rotations').textContent=(frame.time/(2*Math.PI*frame.parameters.ek)).toFixed(2);$('gas-model-time').textContent=frame.time.toPrecision(4);$('gas-grid').textContent=`${frame.width} × ${frame.rows} × ${frame.levels}`;
  $('gas-colors').disabled=!appearance;
  $('gas-layer-note').textContent={appearance:'Cloud appearance colors the computed entropy variations. MagIC does not calculate visible clouds.',entropy:'Entropy minus the shell’s area-weighted mean. Dimensionless, with an automatic color range per frame.',east:'Eastward velocity in the rotating reference frame. Positive eastward, negative westward; units ν/d. Automatic color range.',radial:'Radial velocity. Positive outward, negative inward; units ν/d. The impermeable outer boundary has zero radial flow.',speed:'Three-dimensional flow speed at this shell depth, in units ν/d. Automatic color range.'}[layer];
  $('gas-output-kind').textContent='MAGIC · COMPUTED GAS SHELL';
 }
 function save(name,data,type='application/json'){const u=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 function pause(){if(!worker)return;if(state==='paused')beforeRun();worker.postMessage({type:'pause',paused:state!=='paused'});}
 $('gas-config').onsubmit=e=>{e.preventDefault();start().catch(fail);};$('gas-pause').onclick=pause;
 $('gas-stop').onclick=()=>{cleanup();setState('stopped');$('gas-status').textContent='Stopped. Completed frames remain available.';};
 $('gas-preset').onchange=()=>{setConfig({...GasMagic.defaults,...({deep:{strat:5,radratio:.35,ra:148638.035,perturbation:.01},gentle:{strat:1,ra:50000,ek:.003,radratio:.6}}[$('gas-preset').value]||{})});};
 for(const k of ['strat','radratio'])$('gas-'+k).oninput=labels;
 for(const id of ['gas-layer','gas-colors','gas-depth'])$(id).addEventListener('input',render);
 globe.onchange=()=>{if(texture)globe.draw(texture,$('gas-layer').value!=='appearance');};
 $('gas-time').oninput=()=>{stopReplay();follow=false;index=Number($('gas-time').value);syncFrames();render();};
 $('gas-latest').onclick=()=>{stopReplay();follow=true;index=frames.length-1;syncFrames();render();};
 $('gas-play').onclick=()=>{
  if(timer){stopReplay();return;}if(frames.length<2)return;
  follow=false;index=0;syncFrames();render();$('gas-play').textContent='Pause replay';
  timer=setInterval(()=>{if(index<frames.length-1)index++;else{stopReplay();return;}syncFrames();render();},220);
 };
 $('gas-namelist').onclick=()=>{try{save('magic-input.nml',GasMagic.namelist(getConfig()),'text/plain');}catch(e){$('gas-status').textContent=errorMessage(e);}};
 $('gas-export').onclick=()=>{
  const f=frames[index];if(!f)return;const level=Number($('gas-depth').value),s=GasMagic.shell(f,level);
  save('magic-shell-fields.json',JSON.stringify({model:'MagIC',source_revision:f.revision,config:runConfig,parameters:f.parameters,time:f.time,time_unit:'d²/ν',velocity_unit:'ν/d',entropy_unit:'dimensionless',radius_over_outer:s.radius,width:f.width,rows:f.rows,layout:'longitude-major; latitude index varies fastest',longitude_degrees:Array.from({length:f.width},(_,i)=>i*360/f.width),latitude_degrees:Array.from(f.theta,t=>90-t*180/Math.PI),radial_velocity:Array.from(s.radial),southward_velocity:Array.from(s.south),eastward_velocity:Array.from(s.east),entropy:Array.from(s.entropy),entropy_anomaly:Array.from(s.entropy,v=>v-s.mean),appearance:'Artistic entropy colors; no cloud microphysics'},null,2));
 };
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stopReplay();if(state==='running')pause();}});
 window.addEventListener('pagehide',()=>{cleanup();stopReplay();});
 setConfig(GasMagic.defaults);setState('idle');
 return {setActive(on){active=on;if(!on)stopReplay();if(on){syncFrames();render();}},pauseForClimate(reason='Loading stopped when the rocky climate run started.'){if(state==='running')pause();if(state==='loading'){cleanup();setState('stopped');$('gas-status').textContent=reason;}},get state(){return state;}};
}
