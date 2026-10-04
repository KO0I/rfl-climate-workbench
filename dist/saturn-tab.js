import {createCoordinates,paintLayer} from './saturn-model.js';
import {SATURN_LAYERS,readDroneXpm,clamp} from './saturn-layers.js';
import {makeGeometry,paintSaturn} from './saturn-renderer.js';
import {JUPITER_LAYERS} from './jupiter-layers.js';
import {paintJupiterLayer} from './jupiter-model.js';
import {classifyPolarStorm,regimeFromWorld} from './storm-regime.js';

const presets={saturn:{name:'Saturn-like',layers:SATURN_LAYERS,paint:paintLayer,rings:true},jupiter:{name:'Jupiter-like',layers:JUPITER_LAYERS,paint:paintJupiterLayer,rings:false}};
const jupiterReference=`<p>Cloud decks follow the supplied Jupiter reference: haze, ammonia ice, ammonium hydrosulfide ice, and water ice, above a hydrogen-and-helium envelope. Layer thicknesses are exaggerated and the deep envelope is compressed.</p><p>Belts, the Great Red Spot, and polar cyclone clusters are animated appearance patterns. Their continuation into individual deep cloud decks is speculative. These controls do not solve pressure, chemistry or heat transport.</p><p>The blue-green glass, transparent envelope and red-orange emission are artistic choices. Metallic hydrogen is a deep conducting fluid region; Jupiter’s heavy-element interior is diffuse, not a sharply bounded sphere. The center uses Saturn’s mirror-core proportions.</p><p><a href="https://science.nasa.gov/jupiter/jupiter-facts/" target="_blank" rel="noreferrer">NASA · Jupiter’s clouds, interior and polar cyclones</a></p>`;

export function initSaturnTab(){
 const $=id=>document.getElementById(id),canvas=$('saturn-globe'),ctx=canvas.getContext('2d');
 canvas.width=512;canvas.height=448;
 const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
 let presetId='saturn',preset=presets.saturn,layerDefinitions=preset.layers,WATER_LAYER=3,CORE_LAYER=4;
 const savedStates=new Map(),saturnReference=$('saturn-reference').innerHTML;
 const makeLayerConfigs=()=>layerDefinitions.map(layer=>({...layer.defaults}));
 const map=$('saturn-map'),mapCtx=map.getContext('2d'),mapImage=mapCtx.createImageData(768,384),mapCoords=createCoordinates(768,384);
 const poles=['north','south'].map(pole=>{const c=$('saturn-'+pole),context=c.getContext('2d');return {ctx:context,image:context.createImageData(256,256),coordinates:createCoordinates(256,256,pole)};});
 let textures=layerDefinitions.map(()=>({width:256,height:128,data:new Uint8ClampedArray(256*128*4)}));
 const textureCoords=createCoordinates(256,128);
 let configs=makeLayerConfigs(),current=0,removed=[0,0,0,0,0],yaw=.45,pitch=-.42,opening=105,rings=true,cutaway=true,environment='studio',coreRatio=12/26,zoom=1;
 let active=false,paused=!!reduced?.matches,time=0,speed=1,raf=null,lastTime=0,lastPaint=0,dirty=true,geometryDirty=true,geometry=null,drag=null,xpmLoaded=false;
 const settingConfig=key=>key.startsWith('emission')?configs[CORE_LAYER]:configs[current];
 const STORM_NAMES={2:'ellipse',3:'triangle',4:'square',5:'pentagon',6:'hexagon',7:'heptagon',8:'octagon',9:'nonagon',10:'decagon'};
 let stormInfo={north:{regime:'polygon',m:6},south:{regime:'polygon',m:10}};
 function poleRegime(jet,nu,jetRadiusDeg){
  const {Ro,E}=regimeFromWorld({rotationHours:10.7,planetRadius:6.03e7,jetSpeed:jet,eddyViscosity:nu,jetRadiusDeg});
  return {Ro,E,...classifyPolarStorm(Ro,E)};
 }
 // Opt-in per layer: the prescribed 6/10 boundaries stay until a regime
 // slider moves, which keeps default rendering bit-identical to before.
 function applyRegime(index){
  const c=configs[index];if(!c.stormRegime)return;
  const jet=c.jetSpeed??100,nu=Math.pow(10,c.logEddyVisc??6);
  const north=poleRegime(jet,nu,12),south=poleRegime(jet,nu,28);
  stormInfo={north,south};
  const sides=r=>r.regime==='stable'?0:r.regime==='chaotic'?3:r.m;
  c.sidesNorth=sides(north);c.sidesSouth=sides(south);
  const describe=r=>r.regime==='polygon'?STORM_NAMES[r.m]+' m='+r.m+(r.extrapolated?' · extrapolated':''):r.regime==='stable'?'stable · axisymmetric':'chaotic · rendered m=3 (appearance license)';
  const out=$('saturn-storm-readout');
  if(out)out.textContent='Ro '+north.Ro.toFixed(3)+' · E '+north.E.toExponential(1)+' → N: '+describe(north)+' / S: '+describe(south);
 }
 const range=(key,label,min,max,step)=>`<label for="saturn-${key}">${label}<output id="saturn-${key}-value">${Number(settingConfig(key)[key]).toFixed(2)}</output><input id="saturn-${key}" data-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${settingConfig(key)[key]}"></label>`;
 const color=(key,label)=>`<label class="saturn-color" for="saturn-${key}">${label}<input id="saturn-${key}" data-setting="${key}" type="color" value="${settingConfig(key)[key]}"></label>`;
 const select=(key,label,options)=>`<label for="saturn-${key}">${label}<select id="saturn-${key}" data-setting="${key}">${options.map(([v,t])=>`<option value="${v}" ${configs[current][key]===v?'selected':''}>${t}</option>`).join('')}</select></label>`;
 function controls(){
  const layer=layerDefinitions[current],water=current===WATER_LAYER,metal=current===CORE_LAYER,jupiter=presetId==='jupiter',hydrogen=layer.id==='hydrogen';
  $('saturn-control-layer').textContent=layer.name;
  $('saturn-material-kind').textContent=water?(jupiter?'GLASS · BLUE-GREEN':'GLASS · NEUTRAL DRONE'):metal?(jupiter?'MIRROR · INTERNAL GLOW':'MIRROR · HYDROGEN CENTER'):hydrogen?'TRANSLUCENT ENVELOPE':'CLOUD APPEARANCE';
  let html=color('color',water?'Absorption tint':metal?'Metal tint':'Base color');
  if(!metal)html+=color('accent',water?'Cloud tint':'Secondary color');
  if(water)html+=range('ior','Refractive index',1,2.5,.01)+range('scatter','Surface scatter',0,1,.01)+range('dispersion','Dispersion',0,1,.01)+range('absorption','Absorption',0,1,.01)+range('reflection','Reflection',0,1,.01)+range('cloudOpacity','Cloud frosting',0,1,.01);
  if(metal)html+=range('reflection','Reflectivity',0,1,.01)+range('scatter','Surface scatter',0,1,.01);
  if(jupiter&&(water||metal||hydrogen))html+=color('emissionColor','Core glow color')+range('emission','Internal glow',0,3,.05);
  if(hydrogen)html+=range('opacity','Envelope opacity',0,1,.01);
  if(!water&&!metal)html+=select('palette','Color interpretation',jupiter?[['color','Layer colors'],['thermal','Warm thermal interpretation']]:[['color','Layer colors'],['infrared','Infrared · Cassini-inspired']]);
  if(!metal){
   html+=select('pattern','Turbulence interpretation',[['jets','Banded jets'],['cells','Rolling convection cells'],['filaments','Stretched filaments']])+range('turbulence','Turbulence strength',0,2,.05)+range('detail',hydrogen?'Envelope texture':'Cloud texture',0,2,.05);
   if(!hydrogen)html+=range('wave',jupiter?'Polar cyclone strength':'Polar wave strength',0,2,.05);
   if(jupiter&&!hydrogen)html+=range('storm','Great Red Spot strength',0,1.5,.05);
   html+=range('flow','Layer flow speed',0,3,.05);
   if(!jupiter){
    const jet=configs[current].jetSpeed??100,logNu=configs[current].logEddyVisc??6,engaged=!!configs[current].stormRegime;
    html+=`<div class="storm-regime"><span class="storm-regime-title">Polar storm regime · laboratory Ro/E relation, appearance only</span><label for="saturn-jetSpeed">Polar jet speed<output id="saturn-jetSpeed-value">${jet} m/s</output><input id="saturn-jetSpeed" data-storm="jetSpeed" type="range" min="20" max="400" step="5" value="${jet}"></label><label for="saturn-eddyVisc">Eddy viscosity, log₁₀ m²/s<output id="saturn-eddyVisc-value">${logNu.toFixed(1)}</output><input id="saturn-eddyVisc" data-storm="logEddyVisc" type="range" min="2" max="6" step="0.1" value="${logNu}"></label><span id="saturn-storm-readout">${engaged?'':'Prescribed hexagon/decagon boundaries. Move a regime slider to derive wavenumbers from Ro and E.'}</span></div>`;
   }
  }
  $('saturn-layer-controls').innerHTML=html;
  $('saturn-neutral').hidden=!(water||metal);
  $('saturn-neutral').textContent=jupiter?'Restore Jupiter glass & glow':'Restore neutral drone material';
  $('saturn-optics-environment').hidden=!(water||metal);
  $('saturn-layer-controls').querySelectorAll('[data-setting]').forEach(input=>input.addEventListener('input',()=>{
   const key=input.dataset.setting;settingConfig(key)[key]=input.type==='range'?Number(input.value):input.value;
   const out=$('saturn-'+key+'-value');if(out)out.textContent=Number(input.value).toFixed(2);
   dirty=true;syncLabels();schedule();
  }));
  $('saturn-layer-controls').querySelectorAll('[data-storm]').forEach(input=>input.addEventListener('input',()=>{
   const key=input.dataset.storm;configs[current][key]=Number(input.value);configs[current].stormRegime=true;
   const out=$(key==='jetSpeed'?'saturn-jetSpeed-value':'saturn-eddyVisc-value');
   if(out)out.textContent=key==='jetSpeed'?input.value+' m/s':Number(input.value).toFixed(1);
   applyRegime(current);dirty=true;syncLabels();schedule();
  }));
  if(presetId==='saturn')applyRegime(current);
 }
 function syncLabels(){
  const layer=layerDefinitions[current],metal=current===CORE_LAYER,jupiter=presetId==='jupiter',hydrogen=layer.id==='hydrogen';
  $('gas-object-name').textContent=preset.name.toUpperCase()+' · SPECULATIVE INTERIOR';
  $('saturn-current-layer').textContent=layer.name;
  $('saturn-layer-description').textContent=layer.description;
  $('saturn-layer').value=String(current);
  $('saturn-layer-number').textContent=`LAYER ${current+1} / ${layerDefinitions.length}`;
  $('saturn-peel').disabled=metal;$('saturn-restore').disabled=current===0;
  $('saturn-peel').textContent=metal?'At the center':'Remove this layer';
  $('saturn-cut-toggle').setAttribute('aria-pressed',String(cutaway));
  $('saturn-cut').disabled=!cutaway;$('saturn-cut-value').textContent=opening+'°';
  $('saturn-rings').setAttribute('aria-pressed',String(rings));
  $('saturn-rings').hidden=jupiter;
  $('saturn-poles').hidden=metal||hydrogen;$('saturn-cloud-map').hidden=metal;$('saturn-core-note').hidden=!metal;
  $('saturn-core-note').textContent=jupiter?'Restore the water layer to view the red-orange glow through blue-green glass. The intervening hydrogen envelope is translucent.':'The polar cloud patterns end above this reflective center. Restore the water layer to see the glass shell and mirror core together.';
  $('saturn-map-layer').textContent=layer.name+(current===WATER_LAYER?' · cloud markings':' · longitude / latitude');
  $('saturn-polar-note').textContent=jupiter?'Cyclone clusters inspired by Juno: eight surrounding a northern central cyclone, five around the southern one. Their appearance at depth is speculative.':'Hexagon / decagon retained through water ice; their continuity at depth is speculative.';
  const cap=r=>r.regime==='polygon'?STORM_NAMES[r.m]+' · '+r.m+' sides':r.regime==='stable'?'axisymmetric':'chaotic';
  $('saturn-north-caption').textContent=jupiter?'North · 8 + 1 cyclones':'North · '+cap(stormInfo.north);
  $('saturn-south-caption').textContent=jupiter?'South · 5 + 1 cyclones':'South · '+cap(stormInfo.south);
  $('saturn-south-range').textContent=jupiter?'65° S–90° S':'40° S–90° S';
  $('saturn-interpretation').textContent=metal?(jupiter?'Reflective fluid · red-orange internal glow':'Reflective fluid · artistic center'):current===WATER_LAYER?(jupiter?'Blue-green glass · refracted core glow':'Glass interpretation · neutral drone'):hydrogen?'Translucent hydrogen envelope · artistic compression':configs[current].palette==='infrared'?'False-color infrared interpretation':'Speculative cloud appearance';
  for(const button of $('saturn-layer-list').querySelectorAll('button')){
   const index=Number(button.dataset.layer);button.setAttribute('aria-pressed',String(index===current));button.dataset.removed=String(index<current);
   button.title=index<current?'Restore '+layerDefinitions[index].name:'Expose '+layerDefinitions[index].name;
  }
  canvas.setAttribute('aria-label',`${preset.name}: ${layer.name}. ${cutaway?'Three-dimensional cutaway':'Whole sphere'} with ${current} outer layers removed. Drag or use arrow keys to rotate.`);
  map.setAttribute('aria-label',`${layer.name} cloud markings, longitude and latitude. North is at top.`);
  $('saturn-north').setAttribute('aria-label',`${layer.name}: north polar cloud markings with ${jupiter?'eight cyclones surrounding a central cyclone':stormInfo.north.regime==='polygon'?'a '+STORM_NAMES[stormInfo.north.m]:'an axisymmetric boundary'}.`);
  $('saturn-south').setAttribute('aria-label',`${layer.name}: south polar cloud markings with ${jupiter?'five cyclones surrounding a central cyclone':stormInfo.south.regime==='polygon'?'a '+STORM_NAMES[stormInfo.south.m]:'an axisymmetric boundary'}.`);
  status();
 }
 function status(){
  const moving=removed.some((v,i)=>Math.abs(v-(i<current?1:0))>.0001);
  $('saturn-pause').textContent=paused?'Resume animation':'Pause animation';
  $('saturn-state').textContent=moving?'Changing layers':paused?'Paused':current===CORE_LAYER?(presetId==='jupiter'?'Glowing center':'Mirror center'):'Animating';
 }
 function setLayer(index){
  current=clamp(Math.round(index),0,CORE_LAYER);
  if(!configs[current].stormRegime)stormInfo={north:{regime:'polygon',m:6},south:{regime:'polygon',m:10}};
  if(reduced?.matches)removed=removed.map((v,i)=>i<current?1:0);
  geometryDirty=true;dirty=true;controls();syncLabels();schedule();
 }
 function render(){
  if(geometryDirty||!geometry){geometry=makeGeometry(canvas.width,canvas.height,{yaw,pitch,opening:cutaway?opening:0,removed,rings,coreRatio,zoom,layerDefinitions});geometryDirty=false;}
  if(current<CORE_LAYER){
   preset.paint(mapImage,mapCoords,time,current,configs[current]);mapCtx.putImageData(mapImage,0,0);
   if(!$('saturn-poles').hidden)for(const view of poles){preset.paint(view.image,view.coordinates,time,current,configs[current]);view.ctx.putImageData(view.image,0,0);}
  }
  const detailedClouds=presetId==='jupiter'&&current===0;
  for(let j=0;j<CORE_LAYER;j++)if(removed[j]<.9999&&!(detailedClouds&&j===0))preset.paint(textures[j],textureCoords,time,j,configs[j]);
  // Reuse the full-resolution cloud map on Jupiter, so small eddies remain
  // visible on the globe without rendering a second high-resolution texture.
  const visibleTextures=detailedClouds?[mapImage,...textures.slice(1)]:textures;
  const pixels=paintSaturn(geometry,visibleTextures,configs,{environment,time,infrared:configs[current].palette==='infrared'});
  const image=ctx.createImageData(canvas.width,canvas.height);image.data.set(pixels.data);ctx.putImageData(image,0,0);
  dirty=false;
 }
 function tick(now){
  raf=null;if(!active||document.hidden)return;
  const dt=Math.min(.25,(now-(lastTime||now))/1000);lastTime=now;
  let moving=false;
  for(let i=0;i<CORE_LAYER;i++){
   const target=i<current?1:0,difference=target-removed[i];
   if(Math.abs(difference)>.0001){removed[i]=Math.abs(difference)<.007?target:removed[i]+Math.sign(difference)*Math.min(Math.abs(difference),dt*.9);moving=true;}
  }
  if(moving){geometryDirty=true;dirty=true;}
  if(!paused&&current!==CORE_LAYER){time+=dt*speed;dirty=true;}
  if(dirty&&(now-lastPaint>120||paused)){render();lastPaint=now;status();}
  if(moving||dirty||(!paused&&current!==CORE_LAYER))schedule();
 }
 function schedule(){if(!raf&&active&&!document.hidden)raf=requestAnimationFrame(tick);}
 function stop(){if(raf)cancelAnimationFrame(raf);raf=null;lastTime=0;}
 function buildLayerList(){
  $('saturn-layer').innerHTML=layerDefinitions.map((l,i)=>`<option value="${i}">${i+1}. ${l.name}</option>`).join('');
  $('saturn-layer-list').innerHTML=layerDefinitions.map((l,i)=>`<button type="button" data-layer="${i}" aria-pressed="${i===current}" style="--layer-color:${l.color}"><i aria-hidden="true"></i>${l.short}</button>`).join('');
  $('saturn-layer-list').querySelectorAll('button').forEach(b=>b.onclick=()=>setLayer(Number(b.dataset.layer)));
 }
 function setPreset(id){
  if(!presets[id]||id===presetId)return;
  stop();savedStates.set(presetId,{configs,current,removed,yaw,pitch,opening,rings,cutaway,environment,zoom,time,speed,paused});
  presetId=id;preset=presets[id];layerDefinitions=preset.layers;WATER_LAYER=layerDefinitions.findIndex(l=>l.id==='water');CORE_LAYER=layerDefinitions.findIndex(l=>l.id==='metal');
  const state=savedStates.get(id)||{configs:makeLayerConfigs(),current:0,removed:layerDefinitions.map(()=>0),yaw:.45,pitch:-.42,opening:105,rings:preset.rings,cutaway:true,environment:'studio',zoom:1,time:0,speed:1,paused:!!reduced?.matches};
  ({configs,current,removed,yaw,pitch,opening,rings,cutaway,environment,zoom,time,speed,paused}=state);
  if(!configs[current].stormRegime)stormInfo={north:{regime:'polygon',m:6},south:{regime:'polygon',m:10}};
  textures=layerDefinitions.map(()=>({width:256,height:128,data:new Uint8ClampedArray(256*128*4)}));
  poles[1].coordinates=createCoordinates(256,256,'south',id==='jupiter'?25:50);
  $('saturn-reference').innerHTML=id==='jupiter'?jupiterReference:saturnReference;
  $('saturn-output').dataset.object=id;
  $('saturn-cut').value=opening;$('saturn-zoom').value=zoom;$('saturn-zoom-value').textContent=zoom.toFixed(1)+'×';
  $('saturn-speed').value=speed;$('saturn-speed-value').textContent=speed.toFixed(1)+'×';$('saturn-environment').value=environment;
  geometry=null;geometryDirty=dirty=true;buildLayerList();controls();syncLabels();schedule();
 }
 buildLayerList();
 $('saturn-layer').onchange=()=>setLayer(Number($('saturn-layer').value));
 $('saturn-peel').onclick=()=>setLayer(current+1);$('saturn-restore').onclick=()=>setLayer(current-1);
 $('saturn-pause').onclick=()=>{paused=!paused;status();lastTime=0;schedule();};
 $('saturn-speed').oninput=()=>{speed=Number($('saturn-speed').value);$('saturn-speed-value').textContent=speed.toFixed(1)+'×';};
 $('saturn-reset-layer').onclick=()=>{configs[current]={...layerDefinitions[current].defaults};stormInfo={north:{regime:'polygon',m:6},south:{regime:'polygon',m:10}};controls();syncLabels();dirty=true;schedule();};
 $('saturn-neutral').onclick=()=>{configs[WATER_LAYER]={...layerDefinitions[WATER_LAYER].defaults};configs[CORE_LAYER]={...layerDefinitions[CORE_LAYER].defaults};environment='studio';$('saturn-environment').value=environment;controls();syncLabels();dirty=true;schedule();};
 $('saturn-reset').onclick=()=>{configs=makeLayerConfigs();time=0;speed=1;$('saturn-speed').value=1;$('saturn-speed-value').textContent='1.0×';yaw=.45;pitch=-.42;opening=105;$('saturn-cut').value=105;cutaway=true;rings=preset.rings;zoom=1;$('saturn-zoom').value=1;$('saturn-zoom-value').textContent='1.0×';environment='studio';$('saturn-environment').value=environment;setLayer(0);};
 $('saturn-environment').onchange=()=>{environment=$('saturn-environment').value;dirty=true;schedule();};
 $('saturn-cut-toggle').onclick=()=>{cutaway=!cutaway;geometryDirty=dirty=true;syncLabels();schedule();};
 $('saturn-rings').onclick=()=>{rings=!rings;geometryDirty=dirty=true;syncLabels();schedule();};
 $('saturn-cut').oninput=()=>{opening=Number($('saturn-cut').value);geometryDirty=dirty=true;syncLabels();schedule();};
 $('saturn-zoom').oninput=()=>{zoom=Number($('saturn-zoom').value);$('saturn-zoom-value').textContent=zoom.toFixed(1)+'×';geometryDirty=dirty=true;schedule();};
 for(const [id,p,y] of [['equator',0,0],['view-north',-Math.PI/2,0],['view-south',Math.PI/2,0],['cutaway-view',-.42,.45]])$('saturn-'+id).onclick=()=>{pitch=p;yaw=y;geometryDirty=dirty=true;schedule();};
 canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw+=(e.clientX-drag.x)*.009;pitch=clamp(pitch+(e.clientY-drag.y)*.009,-Math.PI/2,Math.PI/2);drag={x:e.clientX,y:e.clientY};geometryDirty=dirty=true;schedule();});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{drag=null;});
 canvas.addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();
  if(e.key==='ArrowLeft')yaw-=.15;if(e.key==='ArrowRight')yaw+=.15;if(e.key==='ArrowUp')pitch-=.12;if(e.key==='ArrowDown')pitch+=.12;
  pitch=clamp(pitch,-Math.PI/2,Math.PI/2);geometryDirty=dirty=true;schedule();
 });
 document.addEventListener('visibilitychange',()=>{stop();schedule();});window.addEventListener('pagehide',stop);
 controls();syncLabels();
 return {setPreset,setActive(on){active=on;stop();if(on){dirty=true;schedule();
   if(!xpmLoaded){xpmLoaded=true;fetch('./saturn-neutral-drone.xpm').then(r=>{if(!r.ok)throw new Error('XPM unavailable');return r.text();}).then(source=>{coreRatio=readDroneXpm(source).ratio;geometryDirty=dirty=true;schedule();}).catch(()=>{$('saturn-xpm-status').textContent='Using built-in neutral-drone geometry; the XPM source could not be loaded.';});}
  }},get active(){return active;}};
}
