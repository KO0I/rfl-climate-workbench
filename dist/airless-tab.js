import {airlessDefaults,airlessPresets,validateAirless} from './airless-model.js';
const $=id=>document.getElementById(id);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const knobs=[['density','Crater count',0,800,10],['size','Largest radius · degrees',4,24,1],['depth','Crater depth',.2,1.8,.05],['rim','Rim height',0,2,.05],['warp','Rim distortion',0,.15,.005],['age','Degradation / floor fill',0,1,.05],['roughness','Background relief',0,1,.05]];
function save(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export function initAirlessTab(){
 const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./airless.css',import.meta.url).href;document.head.append(css);
 const tab=document.createElement('button');tab.id='tab-airless';tab.setAttribute('role','tab');tab.setAttribute('aria-controls','panel-airless');tab.setAttribute('aria-selected','false');tab.tabIndex=-1;tab.textContent='Airless worlds';
 document.querySelector('.workspace-nav .tabs').append(tab);
 const aside=document.createElement('aside');aside.id='airless-settings';aside.hidden=true;
 aside.innerHTML=`<span class="eyebrow">SURFACE GENERATOR</span><h1>Airless worlds.</h1><p class="intro">Overlapping craters, broken rims, and worn regolith. No atmosphere or fluid simulation.</p>
 <form id="airless-form"><fieldset id="airless-controls"><label for="airless-preset">Surface template<select id="airless-preset"><option value="lunar">Lunar highlands</option><option value="battered">Heavily cratered</option><option value="fresh">Fresh impacts</option><option value="worn">Worn basins</option></select></label>
 <label for="airless-seed">Seed<input id="airless-seed" type="number" min="0" max="4294967295" step="1" value="2448" required></label>
 <label for="airless-resolution">Heightmap detail<select id="airless-resolution"><option value="128">256 × 128 · quick</option><option value="256" selected>512 × 256 · standard</option><option value="512">1024 × 512 · fine</option></select></label>
 <label for="airless-radius">World radius · km<input id="airless-radius" type="number" min="10" max="15000" step="any" value="1737.4" required></label>
 ${knobs.map(([key,label,min,max,step])=>`<label for="airless-${key}">${label}<output id="airless-${key}-value"></output><input id="airless-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${airlessDefaults[key]}"></label>`).join('')}
 <button class="primary" type="submit">Generate surface</button><button id="airless-random" type="button" style="width:100%;margin-top:10px">New seed &amp; generate</button></fieldset></form>
 <button id="airless-cancel" type="button" hidden>Cancel generation</button><p id="airless-status" role="status">Select this tab to generate a surface.</p>
 <details><summary>Generation &amp; limits</summary><p>Seeded crater stamps are applied oldest to newest in spherical coordinates. Younger bowls replace older terrain; rims and ejecta overlap. Degradation softens rims and fills floors.</p><p>These are artistic templates, not impact physics or geological reconstructions. The globe uses terrain normals on a spherical silhouette; it does not show displaced horizon geometry or cast terrain shadows.</p><p>No ExoPlaSim, MagIC, cloud, wind, or pressure fields are generated. Airless surfaces can have day–night temperature cycles, but this template does not calculate temperature.</p></details>`;
 document.querySelector('main').insertBefore(aside,document.querySelector('.workspace'));
 const panel=document.createElement('section');panel.id='panel-airless';panel.className='tab-panel';panel.hidden=true;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','tab-airless');
 panel.innerHTML=`<div class="airless-heading"><div><span class="eyebrow">PROCEDURAL TERRAIN · VACUUM</span><h2>Cratered surface</h2></div><span class="mode">Surface only · no climate engine</span></div>
 <div class="airless-views"><figure><canvas id="airless-globe" width="320" height="320" tabindex="0" role="img" aria-label="Airless cratered globe. Drag or use arrow keys to rotate."></canvas><figcaption>Drag to rotate · arrow keys also work</figcaption></figure><figure><canvas id="airless-map" width="512" height="256" role="img" aria-label="Airless elevation map, north at top, longitude west to east."></canvas><figcaption>Elevation · longitude / latitude · 2:1</figcaption><div class="legend"><span id="airless-min">—</span><div style="background:linear-gradient(90deg,#000,#fff)"></div><span id="airless-max">—</span></div><p id="airless-result" class="control-note">Preparing terrain…</p></figure></div>
 <div class="airless-view-controls"><label for="airless-material">Surface color<select id="airless-material"><option value="stone">Grey regolith</option><option value="blue">Cobalt blue · reference style</option><option value="ochre">Ochre rock</option><option value="ice">Pale ice</option></select></label><label for="airless-light">Light direction <output id="airless-light-value">−45°</output><input id="airless-light" type="range" min="-180" max="180" step="1" value="-45"></label></div>
 <div class="airless-exports"><button id="airless-png" disabled>Heightmap PNG · 8-bit</button><button id="airless-json" disabled>Terrain + template JSON</button><button id="airless-cube" disabled>Cubemap heights JSON</button></div>
 <p class="control-note">PNG uses the displayed minimum and maximum. JSON preserves signed elevations in metres and the reusable generation settings. Cubemap export evaluates six square faces directly, with shared edge coordinates.</p>`;
 document.querySelector('.workspace').append(panel);
 let result=null,normals=null,job=null,active=false,yaw=0,pitch=.12,drag=null,dirty=false;
 const canvas=$('airless-globe'),ctx=canvas.getContext('2d'),image=ctx.createImageData(320,320);
 function labels(){for(const [key] of knobs)$('airless-'+key+'-value').textContent=Number($('airless-'+key).value).toFixed(key==='warp'?3:['density','size'].includes(key)?0:2);}
 function settings(){return validateAirless(Object.fromEntries(Object.keys(airlessDefaults).map(key=>[key,Number($('airless-'+key).value)])));}
 function setSettings(s){for(const [key,value] of Object.entries(s))$('airless-'+key).value=value;labels();}
 function exportsEnabled(on){for(const id of ['png','json','cube'])$('airless-'+id).disabled=!on;}
 function status(text){$('airless-status').textContent=text;}
 function finishJob(){job?.terminate();job=null;$('airless-controls').disabled=false;$('airless-cancel').hidden=true;exportsEnabled(Boolean(result)&&!dirty);}
 function markDirty(){dirty=true;exportsEnabled(false);status('Settings changed. Generate to update the preview and exports.');}
 function metadata(){return {format:'rfl-airless-terrain-v1',generator_version:1,model:'procedural-surface-only',climate_model:null,units:'metres',datum:'nominal spherical radius',settings:result.settings,min:result.min,max:result.max};}
 function generate(){
  if(!$('airless-form').reportValidity())return;
  let s;try{s=settings();}catch(e){status(e.message);return;}
  finishJob();dirty=true;exportsEnabled(false);$('airless-controls').disabled=true;$('airless-cancel').hidden=false;status('Generating cratered terrain…');
  try{job=new Worker(new URL('./airless-worker.js',import.meta.url),{type:'module'});}catch(e){finishJob();status('Could not start terrain generation: '+e.message);return;}
  job.onerror=e=>{e.preventDefault();finishJob();status('Terrain generation failed. Try a lower detail level.');};
  job.onmessage=({data})=>{if(data.type==='error'){finishJob();status(data.message);return;}result=data;dirty=false;finishJob();prepare();draw();status('Surface ready. No climate engine was run.');};
  job.postMessage({type:'terrain',settings:s});
 }
 function prepare(){
  const {width:w,height:h,heights:a,min,max,settings:s}=result,range=max-min||1;
  const map=$('airless-map');map.width=w;map.height=h;const mc=map.getContext('2d'),im=mc.createImageData(w,h);normals=new Float32Array(w*h*3);
  const radius=s.radius*1000;
  for(let y=0;y<h;y++){
   const lat=Math.PI*(.5-(y+.5)/h),sl=Math.sin(lat),cl=Math.cos(lat),dy=Math.PI/h;
   for(let x=0;x<w;x++){
    const i=y*w+x,j=i*4,k=i*3,lon=((x+.5)/w-.5)*Math.PI*2,sn=Math.sin(lon),cs=Math.cos(lon),grey=Math.round(255*(a[i]-min)/range);
    im.data[j]=im.data[j+1]=im.data[j+2]=grey;im.data[j+3]=255;
    const east=(a[y*w+(x+1)%w]-a[y*w+(x+w-1)%w])/(2*2*Math.PI/w*Math.max(.025,cl)*radius);
    const north=(a[Math.max(0,y-1)*w+x]-a[Math.min(h-1,y+1)*w+x])/((y===0||y===h-1?1:2)*dy*radius);
    let nx=cl*sn-east*cs+north*sl*sn,ny=sl-north*cl,nz=cl*cs+east*sn+north*sl*cs;const n=Math.hypot(nx,ny,nz);
    normals[k]=nx/n;normals[k+1]=ny/n;normals[k+2]=nz/n;
   }
  }
  mc.putImageData(im,0,0);$('airless-min').textContent=(min/1000).toFixed(2)+' km';$('airless-max').textContent=(max/1000).toFixed(2)+' km';
  $('airless-result').textContent=w+' × '+h+' samples · '+result.craterCount+' crater stamps · seed '+s.seed;
  if(active)$('model-resolution').textContent='Airless · '+w+' × '+h+' · surface only';
 }
 function draw(){
  if(!active||!result)return;
  const {width:w,height:h,heights:a,min,max}=result,out=image.data,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const light=Number($('airless-light').value)*Math.PI/180,L=[Math.sin(light)*.94,.34,Math.cos(light)*.94];
  const rgb={stone:[174,169,160],blue:[45,102,236],ochre:[192,133,83],ice:[179,215,229]}[$('airless-material').value];
  for(let y=0;y<320;y++)for(let x=0;x<320;x++){
   const i=(y*320+x)*4,nx=(x-159.5)/148,ny=(159.5-y)/148,q=nx*nx+ny*ny;out[i]=3;out[i+1]=3;out[i+2]=6;out[i+3]=255;if(q>1)continue;
   const nz=Math.sqrt(1-q),yy=cp*ny-sp*nz,zz=sp*ny+cp*nz,xx=cy*nx+sy*zz,z=-sy*nx+cy*zz;
   const u=((Math.floor((Math.atan2(xx,z)/Math.PI/2+.5)*w)%w)+w)%w,v=clamp(Math.floor((.5-Math.asin(clamp(yy,-1,1))/Math.PI)*h),0,h-1),j=v*w+u,k=j*3;
   const vx=cy*normals[k]-sy*normals[k+2],vz=sy*normals[k]+cy*normals[k+2],vy=cp*normals[k+1]+sp*vz,viewZ=-sp*normals[k+1]+cp*vz;
   const diffuse=Math.max(0,vx*L[0]+vy*L[1]+viewZ*L[2]),albedo=.72+.28*(a[j]-min)/(max-min||1),shade=.025+.975*diffuse;
   for(let c=0;c<3;c++)out[i+c]=clamp(rgb[c]*albedo*shade*1.35,0,255);
  }
  ctx.putImageData(image,0,0);
 }
 $('airless-form').onsubmit=e=>{e.preventDefault();generate();};
 $('airless-random').onclick=()=>{$('airless-seed').value=crypto.getRandomValues(new Uint32Array(1))[0];generate();};
 $('airless-preset').onchange=()=>{const s={...airlessPresets[$('airless-preset').value],resolution:Number($('airless-resolution').value)};setSettings(s);generate();};
 $('airless-controls').addEventListener('input',()=>{labels();markDirty();});
 $('airless-resolution').addEventListener('change',markDirty);
 $('airless-cancel').onclick=()=>{finishJob();status('Generation cancelled. Previous surface retained.');};
 $('airless-material').onchange=draw;$('airless-light').oninput=()=>{$('airless-light-value').textContent=$('airless-light').value+'°';draw();};
 canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);};
 canvas.onpointermove=e=>{if(!drag)return;yaw+=(e.clientX-drag[0])*.008;pitch=clamp(pitch+(e.clientY-drag[1])*.008,-1.4,1.4);drag=[e.clientX,e.clientY];draw();};
 for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>drag=null);
 canvas.onkeydown=e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();if(e.key==='ArrowLeft')yaw-=.12;if(e.key==='ArrowRight')yaw+=.12;if(e.key==='ArrowUp')pitch=clamp(pitch-.12,-1.4,1.4);if(e.key==='ArrowDown')pitch=clamp(pitch+.12,-1.4,1.4);draw();};
 $('airless-png').onclick=()=>{if(result&&!dirty)$('airless-map').toBlob(blob=>{if(blob)save(blob,'airless-'+result.settings.seed+'-height.png');else status('PNG export failed.');});};
 $('airless-json').onclick=()=>{if(result&&!dirty)save(new Blob([JSON.stringify({...metadata(),projection:'equirectangular',width:result.width,height:result.height,sampling:'pixel centres; north to south, -180 to +180 longitude',heights:Array.from(result.heights)})],{type:'application/json'}),'airless-'+result.settings.seed+'.json');};
 $('airless-cube').onclick=()=>{
  if(!result||dirty||job)return;
  $('airless-controls').disabled=true;exportsEnabled(false);$('airless-cancel').hidden=false;status('Generating six cube faces directly from the same crater field…');
  try{job=new Worker(new URL('./airless-worker.js',import.meta.url),{type:'module'});}catch(e){finishJob();status('Could not start cubemap export.');return;}
  job.onerror=e=>{e.preventDefault();finishJob();status('Cubemap export failed. Try a lower detail level.');};
  job.onmessage=({data})=>{finishJob();if(data.type==='error'){status(data.message);return;}save(new Blob([JSON.stringify({...metadata(),projection:'cubemap',size:data.size,sampling:'inclusive face edges; u,v from -1 to +1; row-major',directions:{px:'normalize(1,-v,-u)',nx:'normalize(-1,-v,u)',py:'normalize(u,1,v)',ny:'normalize(u,-1,-v)',pz:'normalize(u,-v,1)',nz:'normalize(-u,-v,-1)'},faces:Object.fromEntries(Object.entries(data.faces).map(([face,a])=>[face,Array.from(a)]))})],{type:'application/json'}),'airless-'+result.settings.seed+'-cubemap.json');status('Cubemap exported. Adjacent face edges share the same terrain.');};
  job.postMessage({type:'cube',settings:result.settings});
 };
 window.addEventListener('pagehide',finishJob);
 labels();
 return {setActive(on){active=on;aside.hidden=!on;document.body.classList.toggle('airless-mode',on);if(on){if(!result&&!job)generate();if(result){$('model-resolution').textContent='Airless · '+result.width+' × '+result.height+' · surface only';draw();}else $('model-resolution').textContent='Airless · surface only';}}};
}
