import './model-config.js';
import './terrain.js';
import {initMagicTab} from './magic-tab.js';
import {initSaturnTab} from './saturn-tab.js';
import {generateSolver,solverDefaults,solverPreset,solverKnobs} from './terrain-solver.js';
import {randomSurface} from './planet-tool/random-surface.js';
import {Playback} from './playback.js';
import {Globe} from './planet-tool/globe.js';
import {createCloudLayer,paintCloudMap,CLOUD_RADIUS} from './planet-tool/clouds.js';
import {drawCubeMap} from './planet-tool/cubemap.js';
import {paletteBmp,paletteXpm,palettePixels,readPaletteFile} from './planet-tool/palette.js';
import {loadClimateEngine,errorMessage} from './engine-loader.js';
import {atmospheres, worlds, climateSupport, paletteGradient, randomWorld, randomProfiles} from './world-catalog.js';
import {surfaceProfiles,surfaceBounds,defaultSurfaceConfig,validateSurfaceConfig,estimateSurface,surfacePlausibility} from './surface-model.js';
const $=id=>document.getElementById(id);
const controls=['flux','co2','rotation','days'];
const surfaceControls=['flux','rotation','pressure','albedo'];
const support=()=>climateSupport(selection.planet,selection.atmosphere);
const palettes={thermal:['#272454','#2878b6','#60ced0','#f1da89','#e87942','#a82841'],cloud:['#0b2940','#456883','#b8d7df','#ffffff'],wind:['#132b46','#296f92','#8fd8cc','#f2d37d','#fa774b'],pressure:['#39275e','#665baa','#5395b0','#78c4ba','#d8edac']};
const fields={surface:{title:'Planet tool colors',mean:'Land coverage',lo:0,hi:100,unit:'%',palette:'thermal',note:'RFL terrain and palette at the selected display resolution. Climate uses the original 64 × 32 terrain samples. Colors and cloud detail are visual only.'},elevation:{title:'Terrain elevation',mean:'Global mean elevation',lo:0,hi:3000,unit:'m',palette:'pressure',note:'Elevation above the liquid surface. ExoPlaSim uses the original 64 × 32 samples and spectrally smooths them.'},surfaceTemperature:{title:'Surface temperature',mean:'Mean surface temperature',lo:220,hi:320,unit:'K',palette:'thermal',note:'Temperature of the ground, liquid or ice surface from ExoPlaSim.'},temperature:{title:'Surface air temperature',mean:'Global mean temperature',lo:220,hi:320,unit:'K',palette:'thermal',note:'Diagnosed surface air temperature, on the model’s Gaussian grid.'},cloud:{title:'Total cloud cover',mean:'Global mean cloud cover',lo:0,hi:100,unit:'%',palette:'cloud',note:'Column cloud fraction from ExoPlaSim’s cloud parameterization. It does not resolve individual clouds.'},wind:{title:'Lowest-level wind',mean:'Global mean wind speed',lo:0,hi:60,unit:'m/s',palette:'wind',note:'Wind speed at the lowest atmospheric model level (sigma ≈ 0.95).'},pressure:{title:'Surface pressure',mean:'Global mean pressure',lo:500,hi:1050,unit:'hPa',palette:'pressure',note:'Actual surface pressure, including the effect of terrain elevation; not sea-level pressure.'}};
let worker=null, state='idle', latest=null, config=null, runWorld=null;
let loader=null,workerURL=null,startupTimer=null;
let selection={planet:'temperate',atmosphere:'nitrogen'};
let terrainSettings={...ExoTerrain.defaults},terrain=ExoTerrain.generate(terrainSettings),runTerrain=null;
let surfaceResolution='low',displayTerrain=terrain;
let terrainGenerator='quick',solverSettings={...solverDefaults},solverResult=null,solverResultKey=null,terrainRequest=null;
let appliedOverview=null,appliedMaximum=null;
const solverKey=()=>JSON.stringify([terrainSettings.seed,solverSettings]);
const solverReady=()=>Boolean(solverResult&&solverResultKey===solverKey());
let heightmapCache=null;
const resolutionScale=()=>surfaceResolution==='high'?2:1;
const currentGrid=()=>latest?.grid||ExoConfig.resolution();
function rebuildTerrain(){
 if(terrainGenerator==='solver'){
  if(!solverReady())return;
  terrain=solverResult.low;displayTerrain=surfaceResolution==='high'?solverResult.high:terrain;
  appliedOverview=surfaceResolution==='high'?solverResult.overviewHigh:solverResult.overviewLow;appliedMaximum=solverResult.maxElevation;
 }else{terrain=ExoTerrain.generate(terrainSettings);displayTerrain=surfaceResolution==='high'?ExoTerrain.generate(terrainSettings,128):terrain;appliedOverview=null;appliedMaximum=null;}
 heightmapCache=null;cloudCache=null;
}
let selectedPalettePixel=0;
let surfacePalette=[...ExoTerrain.palette],cloudMode='original',activeTab='climate',replayTimer=null,replaySpeed=1;
const playback=new Playback(),globe=new Globe($('planet'));
let lastTexture=null,lastCloudLayer=null,cloudCache=null;
const climateTexture=document.createElement('canvas');climateTexture.width=1024;climateTexture.height=512;
globe.onchange=()=>{if(lastTexture)globe.draw(lastTexture,$('field').value!=='surface',lastCloudLayer,surfacePalette);};
const scientific=key=>!['surface','elevation'].includes(key);
const climateBusy=()=>['loading','running','paused'].includes(state);
const gasTab=initMagicTab({beforeRun:()=>{if(state==='loading')reset();else if(state==='running')togglePause();}});
const saturnTab=initSaturnTab();
function syncGasMode(){
 const mode=$('gas-mode').value,approximate=['saturn','jupiter'].includes(mode),on=activeTab==='gas';
 document.body.classList.toggle('saturn-mode',on&&approximate);
 $('saturn-controls').hidden=$('saturn-output').hidden=!approximate;
 $('gas-magic-settings').hidden=$('gas-magic-output').hidden=approximate;
 if(approximate)saturnTab.setPreset(mode);
 gasTab.setActive(on&&!approximate);saturnTab.setActive(on&&approximate);
 if(on)$('model-resolution').textContent=approximate?(mode==='jupiter'?'Jupiter-like':'Saturn-like')+' · animated approximation':'MagIC · rotating gas shell';
}
$('gas-mode').onchange=()=>{if(['saturn','jupiter'].includes($('gas-mode').value))gasTab.pauseForClimate('Loading stopped when the gas giant appearance preset was selected.');syncGasMode();};

const busy=()=>climateBusy()||Boolean(terrainRequest);
function lock(on){
 const blocked=on||Boolean(terrainRequest),s=support(),approx=s.mode==='surface-estimate',active=approx?surfaceControls:controls;
 for(const id of new Set([...controls,...surfaceControls]))$(id).disabled=blocked||!s.supported||!active.includes(id)||(approx&&['ice','silicate'].includes(selection.planet)&&id==='pressure')||(approx&&selection.planet==='silicate'&&id==='rotation');
 $('run').disabled=blocked||!s.supported||(terrainGenerator==='solver'&&!solverReady());
 for(const id of ['planet-type','atmosphere-type','randomize'])$(id).disabled=blocked;
 $('terrain-controls').disabled=blocked;
 for(const tab of document.querySelectorAll('.generator-tabs [role=tab]'))tab.disabled=climateBusy();
 $('generator-cancel').hidden=!terrainRequest;
}
function setState(next){state=next;lock(['loading','running','paused'].includes(state));$('pause').disabled=!['running','paused'].includes(state);$('pause').textContent=state==='paused'?'Resume':'Pause';$('reset').disabled=state==='idle';syncPlayback();syncLayers();}
function addLog(text){$('log').textContent=text||'No additional diagnostics.';}
function getConfig(){const approx=support().mode==='surface-estimate',values=Object.fromEntries((approx?surfaceControls:controls).map(id=>[id,Number($(id).value)]));return approx?validateSurfaceConfig(selection.planet,selection.atmosphere,values):ExoConfig.validate(values);}
function stopWorker(){clearTimeout(startupTimer);startupTimer=null;loader?.abort();loader=null;if(worker)worker.terminate();worker=null;if(workerURL)URL.revokeObjectURL(workerURL);workerURL=null;}
function failRun(error,details){const message=errorMessage(error);setState('error');$('status').textContent=message;addLog(details||message);stopWorker();}
async function startRun(c=getConfig()){
 gasTab.pauseForClimate();
 if(['loading','running','paused'].includes(state))throw new Error('Reset the current run before starting another.');
 if(terrainRequest||(terrainGenerator==='solver'&&!solverReady()))throw new Error('Generate the selected terrain before starting a simulation.');
 if(!support().supported)throw new Error(support().reason+' Randomize world picks a combination with fields.');
 const invalidTerrain=[...document.querySelectorAll('#terrain-controls input')].find(input=>!input.checkValidity());
 if(invalidTerrain){invalidTerrain.reportValidity();throw new Error('Check the terrain generation settings before running.');}
 if(support().mode==='surface-estimate'){
  reset();runWorld={...selection};runTerrain={...terrainSettings};config=validateSurfaceConfig(selection.planet,selection.atmosphere,c);
  for(const id of surfaceControls)$(id).value=String(config[id]);
  const result=estimateSurface(selection.planet,selection.atmosphere,config),issue=surfacePlausibility(selection.planet,selection.atmosphere,result);
  if(issue)throw new Error(issue);
  latest=result;setState('complete');if($('field').value==='surface')$('field').value='temperature';$('empty').style.display='none';$('download').disabled=false;$('progress').value=1;
  $('elapsed').textContent='Steady state';$('speed').textContent='No time run';$('status').textContent='Surface estimate ready · temperature and pressure';
  addLog(result.assumptions.join('\n')+'\nMean absorbed energy: '+result.statistics.mean_input_w_m2.toFixed(3)+' W/m²\nMean outgoing energy: '+result.statistics.mean_outgoing_w_m2.toFixed(3)+' W/m²');
  render();return {state,config,model:result.model};
 }
 runWorld={...selection};runTerrain={...terrainSettings};clearReplay();playback.reset();
 config=ExoConfig.validate(c);for(const id of controls)$(id).value=String(config[id]);
 stopWorker();latest=null;$('download').disabled=true;$('empty').style.display='flex';$('elapsed').textContent=$('mean').textContent=$('speed').textContent='—';$('progress').value=0;
 setState('loading');render();$('status').textContent='Loading the climate engine…';addLog('Loading ExoPlaSim.');
 const pending=new AbortController();loader=pending;
 startupTimer=setTimeout(()=>{if(loader===pending)failRun('The climate engine download timed out. Check your connection and try again.');},90000);
 try{
  const assets=await loadClimateEngine(pending.signal);
  if(loader!==pending){URL.revokeObjectURL(assets.workerURL);return {state};}
  workerURL=assets.workerURL;
  worker=new Worker(workerURL,{name:'ExoPlaSim climate engine'});
  clearTimeout(startupTimer);
  startupTimer=setTimeout(()=>{if(loader===pending)failRun('The climate engine did not finish starting. Reset and try again, or open the site in your main browser.');},120000);
  worker.onmessage=({data:d})=>{
   if(loader!==pending)return;
   if(d.type==='booted')$('status').textContent='Starting the climate engine…';
   if(d.type==='status')$('status').textContent=d.message;
   if(d.type==='ready'){clearTimeout(startupTimer);startupTimer=null;setState('running');$('status').textContent='Running locally on this device';}
   if(d.type==='frame'){
    const first=!playback.tail;playback.push(d);latest=playback.current;if(first&&activeTab==='climate'&&$('field').value==='surface')$('field').value='temperature';$('empty').style.display='none';$('download').disabled=false;$('elapsed').textContent=(d.steps*d.dt/86400).toFixed(2)+' days';$('progress').value=d.steps/d.target;
    const speed=d.runningMs>0?(d.steps*d.dt/86400)/(d.runningMs/60000):0;$('speed').textContent=speed.toFixed(1)+' days/min';syncLayers();syncPlayback();render();
   }
   if(d.type==='paused'){setState('paused');$('status').textContent='Paused · atmosphere held in memory';}
   if(d.type==='resumed'){setState('running');$('status').textContent='Running locally on this device';}
   if(d.type==='complete'){if(!playback.replaying)playback.seek(playback.all.length-1);setState('complete');$('status').textContent='Run complete · fields ready to export';addLog(d.log);stopWorker();}
   if(d.type==='error')failRun(d.message,d.log);
  };
  worker.onerror=e=>{e.preventDefault();if(loader===pending)failRun(errorMessage(e,'The browser could not start the climate engine. Reset and try again, or open the site in your main browser.'));};
  worker.onmessageerror=()=>{if(loader===pending)failRun('The browser could not receive the climate results. Reset and try again.');};
  worker.postMessage({type:'start',config,resolution:'low',terrain:runTerrain,
   terrainGrid:{generator:terrain.generator||'quick',width:terrain.width,rows:terrain.rows,land:terrain.land,elevation:terrain.elevation,sinLat:terrain.sinLat},
   wasmBinary:assets.wasmBinary,modelData:assets.modelData},[assets.wasmBinary,assets.modelData]);
 }catch(e){if(loader!==pending)return {state};failRun(e);throw new Error(errorMessage(e));}
 return {state,config};
}
$('config').onsubmit=async e=>{e.preventDefault();try{await startRun();}catch(e){$('status').textContent=errorMessage(e);}};
function togglePause(){if(state==='paused')gasTab.pauseForClimate();if(state==='running'||state==='paused')worker?.postMessage({type:state==='running'?'pause':'resume'});}
$('pause').onclick=togglePause;
function reset(){stopWorker();clearReplay();playback.reset();latest=null;config=null;runWorld=null;runTerrain=null;lastTexture=null;lastCloudLayer=null;cloudCache=null;setState('idle');$('status').textContent=support().supported?'Ready to start':'Appearance preview ready';$('progress').value=0;$('empty').style.display='flex';$('download').disabled=true;$('elapsed').textContent=$('mean').textContent=$('speed').textContent='—';for(const id of ['map','planet']){const canvas=$(id);canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);}addLog('Waiting for a run.');}
$('reset').onclick=()=>{reset();render();};
function renderWorld(){
 const w=worlds[selection.planet],a=atmospheres[selection.atmosphere],s=support(),supported=s.supported,approx=s.mode==='surface-estimate';
 $('planet-type').value=selection.planet;$('atmosphere-type').value=selection.atmosphere;
 $('atmosphere-title').textContent=a.name;$('world-regime').textContent=w.name+' · '+w.regime;
 $('world-detail').textContent=approx?surfaceProfiles[selection.planet].description:w.detail;$('preview-mode').textContent=approx?'Surface estimate':supported?'ExoPlaSim climate':'Appearance only';
 $('extreme-warning').hidden=!surfaceProfiles[selection.planet];
 $('extreme-warning').title=approx?'Extreme conditions: fields use a simplified surface estimate, not a full climate simulation.':'Extreme conditions: this atmosphere combination is an appearance preview only.';
 $('sky-gradient').style.background=paletteGradient(selection.atmosphere,'to top');
 $('sky-gradient').setAttribute('aria-label',a.description);
 $('atmosphere-gradient').style.background=paletteGradient(selection.atmosphere);
 $('atmosphere-gradient').setAttribute('aria-label',a.description);
 $('atmosphere-swatches').replaceChildren(...a.colors.map((hex,i)=>{const item=document.createElement('span'),chip=document.createElement('i');chip.style.background=hex;chip.setAttribute('aria-hidden','true');item.append(chip,document.createTextNode((a.labels||['Horizon','Upper','Edge'])[i]+' '+hex.toUpperCase()));return item;}));
 $('palette-source').textContent=a.source?'Daytime colors from RFL’s Earthlike atmosphere: pale blue → cyan → electric blue → deep blue. RFL blends these with lighting and viewing angle; this gradient shows its color anchors.':'Illustrative scattering palette, not a computed spectrum. Gas mix, haze, pressure and starlight all affect real sky colors.';
 $('model-scope').textContent=s.reason+(!supported?' Randomize world always picks a combination with fields.':'');
 $('run-help').textContent=approx?'Calculates a steady surface estimate. No weather evolution is simulated.':supported?'Uses the climate options above.':'Choose a supported atmosphere or use Randomize world.';
 $('run').textContent=approx?'Generate surface fields':'Run simulation';
 $('engine-label').textContent=approx?'GREY ENERGY BALANCE':'EXOPLASIM';
 $('rotation-label').textContent=approx?'Solar day length':'Rotation period';
 $('experiment-title').textContent=approx?'Extreme surface estimate':'Climate experiment';
 $('output-kind').textContent=approx?'SIMPLIFIED SURFACE ESTIMATE · SMOOTH SPHERE':'SIMULATED CLIMATE · RFL TERRAIN';
 $('elapsed-label').textContent=approx?'Solution':'Simulated';$('speed-label').textContent=approx?'Time evolution':'Model speed';
 for(const id of ['co2','days'])$(id).closest('label').hidden=approx;
 for(const id of ['pressure','albedo'])$(id).closest('label').hidden=!approx;
 $('rotation').closest('label').hidden=approx&&selection.planet==='silicate';
 $('pressure').closest('label').hidden=!approx||['ice','silicate'].includes(selection.planet);
 $('estimate-note').hidden=!approx;
 if(approx){const p=surfaceBounds(selection.planet,selection.atmosphere);for(const id of surfaceControls){$(id).min=p[id][0];$(id).max=p[id][1];} $('rotation').step='0.1';}
 else{for(const [id,lo,hi] of [['flux',800,1800],['co2',10,2000],['rotation',0.5,10]]){$(id).min=lo;$(id).max=hi;}}
 for(const option of $('atmosphere-type').options){const mode=climateSupport(selection.planet,option.value);option.textContent=atmospheres[option.value].name+(mode.supported?'':' · appearance only');}
 syncLayers();
 $('empty-title').textContent=approx?'Your surface estimate will appear here.':supported?'Your simulation will appear here.':'Upper atmosphere preview is available in its tab.';
 updateResolutionNote();
 $('empty-description').textContent=approx?'Generate surface fields for this extreme world.':supported?'Run the model to generate a field.':'This composition has no field model. Randomize world chooses a supported combination.';
 lock(busy());
 render();
}
function selectWorld(next,values){
 if(busy())return;
 selection=next;cloudMode='original';reset();
 if(values)for(const id of new Set([...controls,...surfaceControls]))if(values[id]!==undefined)$(id).value=String(values[id]);
 renderWorld();
}
const groups=new Map();
for(const [id,w] of Object.entries(worlds)){
 if(!groups.has(w.group)){const group=document.createElement('optgroup');group.label=w.group;groups.set(w.group,group);$('planet-type').append(group);}
 const option=document.createElement('option');option.value=id;option.textContent=w.name;groups.get(w.group).append(option);
}
for(const [id,a] of Object.entries(atmospheres)){const option=document.createElement('option');option.value=id;option.textContent=a.name;$('atmosphere-type').append(option);}
function selectionDefaults(planet,atmosphere){return climateSupport(planet,atmosphere).mode==='surface-estimate'?defaultSurfaceConfig(planet,atmosphere):worlds[planet].model;}
$('planet-type').onchange=()=>{const planet=$('planet-type').value,w=worlds[planet];selectWorld({planet,atmosphere:w.atmosphere},selectionDefaults(planet,w.atmosphere));};
$('atmosphere-type').onchange=()=>{const atmosphere=$('atmosphere-type').value;selectWorld({...selection,atmosphere},selectionDefaults(selection.planet,atmosphere));};
$('randomize').onclick=async()=>{if(busy())return;try{const result=randomWorld(selection.planet,Number($('days').value),Math.random);selectWorld({planet:result.planet,atmosphere:result.atmosphere},result.config);if(await randomizeSurface())await startRun();}catch(e){$('status').textContent=errorMessage(e);}};
$('random-weights').textContent=Object.entries(randomProfiles).map(([id,p])=>worlds[id].name+' '+p.weight+'%').join(' · ')+'.';
for(const id of new Set([...controls,...surfaceControls]))$(id).addEventListener('input',()=>{if(!busy()&&latest){reset();render();}});
renderWorld();
function colors(name){return palettes[name].map(h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]);}
function color(t,p){const n=Math.max(0,Math.min(1,t))*(p.length-1),i=Math.min(p.length-2,Math.floor(n)),q=n-i;return `rgb(${p[i].map((a,k)=>Math.round(a+(p[i+1][k]-a)*q)).join(',')})`;}
function valueAt(i,key,surface=terrain){
 if(key==='surface')return surface.land[i]*100;
 if(key==='elevation')return surface.elevation[i];
 const a=latest.fields,n=latest.grid.cells,approx=latest.model==='surface-estimate';
 if(key==='temperature')return a[approx?6*n+i:i];
 if(key==='surfaceTemperature')return a[6*n+i];
 if(key==='cloud')return a[n+i]*100;
 if(key==='wind')return Math.hypot(a[2*n+i],a[3*n+i]);
 return a[4*n+i]/(approx?100000:100);
}
function syncLayers(){
 const approx=support().mode==='surface-estimate',ready=Boolean(latest);
 for(const option of $('field').options){
  option.disabled=scientific(option.value)&&(!ready||(approx&&!['temperature','pressure'].includes(option.value)));
  if(option.value==='temperature')option.textContent=approx?'Estimated surface temperature · K':'Air temperature · K';
  if(option.value==='pressure')option.textContent=approx?'Surface pressure · bar':'Surface pressure · hPa';
 }
 if($('field').selectedOptions[0]?.disabled)$('field').value='surface';
 $('cloud-source').disabled=(!ready||approx)&&cloudMode!=='simulation';
 $('cloud-source').setAttribute('aria-pressed',String(cloudMode==='simulation'));
 $('cloud-source').textContent=cloudMode==='simulation'?'Use original RFL clouds':'Use simulated clouds';
 const cloudUnavailable=cloudMode==='simulation'&&(!ready||approx);
 $('cloud-note').textContent=approx?'This steady surface estimate has no simulated clouds. Original RFL clouds are an appearance preview.':cloudUnavailable?'Waiting for simulated cloud cover. No original clouds are drawn in this mode.':cloudMode==='simulation'?'Simulated coverage shapes the existing 3D noise on a larger cloud shell. High res splits each climate cell into four display cells; their mean coverage stays the same.':'Original RFL noise on an oversized cloud shell. Switch to simulated coverage after the first climate frame.';
 $('cloud-amount').disabled=cloudMode==='simulation';
 $('field-help').textContent=ready?(approx?'Only temperature and pressure are estimated for this world.':'Both views show the same climate frame. A field layer replaces terrain and cloud colors.'):'Simulated layers become available with the first output frame.';
 $('terrain-note').textContent=approx?'Terrain colors show appearance only here. The extreme estimate ignores elevation and land/liquid boundaries.':'Climate uses the 64 × 32 land mask and elevation. High res adds terrain detail for display. Reset the run to change terrain.';
}
function getCloudLayer(){
 const scale=resolutionScale();
 if(!cloudCache||cloudCache.frame!==latest||cloudCache.settings!==terrainSettings||cloudCache.mode!==cloudMode||cloudCache.scale!==scale){
  cloudCache={frame:latest,settings:terrainSettings,mode:cloudMode,scale,layer:createCloudLayer(terrainSettings,cloudMode,latest,scale)};
 }
 return cloudCache.layer;
}
function renderTerrainHeightmap(){
 const width=appliedOverview?.width||displayTerrain.width*2,rows=appliedOverview?.rows||displayTerrain.width;
 const settings=displayTerrain.settings||terrainSettings,{seed,sea,frequency,relief}=settings;
 const cacheKey=appliedOverview||[width,rows,seed,sea,frequency,relief].join(':');
 if(heightmapCache===cacheKey)return;
 const canvas=$('terrain-heightmap'),p=colors('pressure'),maximum=appliedMaximum||Math.max(100,relief);
 canvas.width=width;canvas.height=rows;
 const ctx=canvas.getContext('2d');ctx.clearRect(0,0,width,rows);
 // Keep the doubled latitude detail and equal angular sampling in both axes:
 // 360 degrees of longitude by 180 degrees of latitude, with square pixels.
 for(let y=0;y<rows;y++){
  const lat=(.5-(y+.5)/rows)*Math.PI;
  for(let x=0;x<width;x++){
   const lon=(x/width-.5)*2*Math.PI;
   const elevation=appliedOverview?appliedOverview.elevation[y*width+x]:Math.max(0,(ExoTerrain.heightAt(lon,lat,settings)-sea)/(.9375-sea))*relief;
   ctx.fillStyle=color(elevation/maximum,p);ctx.fillRect(x,y,1,1);
  }
 }
 $('terrain-heightmap-gradient').style.background=`linear-gradient(90deg,${palettes.pressure.join(',')})`;
 $('terrain-heightmap-high').textContent=maximum+' m';
 $('terrain-heightmap-resolution').textContent=width+' longitude × '+rows+' latitude · 2:1 map · square pixels · '+(appliedOverview?'Terrain Solver':'Quick heightmap');
 heightmapCache=cacheKey;
}
function render(){
 renderTerrainHeightmap();
 const grid=currentGrid(),key=$('field').value,approx=support().mode==='surface-estimate',s={...fields[key]},isField=scientific(key);
 if(approx&&isField){
  s.unit=key==='temperature'?'K':'bar';s.title=key==='temperature'?'Estimated surface temperature':selection.planet==='silicate'?'Rock vapor pressure proxy':'Prescribed surface pressure';
  s.mean=key==='temperature'?'Mean surface temperature':'Mean surface pressure';
  s.note=key==='temperature'?'Steady grey energy balance; no circulation or terrain feedback. The color scale fits this world.':selection.planet==='silicate'?'Illustrative local vapor-pressure proxy; no chemistry or atmospheric flow is solved.':'Uniform prescribed pressure; no weather or terrain pressure variations are modeled.';
  if(latest){const values=Array.from({length:grid.cells},(_,i)=>valueAt(i,key)),lo=Math.min(...values),hi=Math.max(...values);s.lo=key==='temperature'?Math.floor(lo/10)*10:0;s.hi=key==='temperature'?Math.max(s.lo+10,Math.ceil(hi/10)*10):hi||1;}
 }
 if(key==='elevation'){s.hi=appliedMaximum||Math.max(100,(displayTerrain.settings||terrainSettings).relief);s.note='Surface elevation above sea level. ExoPlaSim uses the original 64 × 32 terrain grid and spectrally smooths the elevation.';}
 const fmt=v=>s.unit==='bar'?Number(v.toPrecision(3)).toString():v.toFixed(0);
 $('field-title').textContent=s.title;$('mean-label').textContent=s.mean;$('note').textContent=s.note;
 for(const suffix of ['', '-planet']){
  $('low'+suffix).textContent=key==='surface'?'Liquid':fmt(s.lo)+' '+s.unit;
  $('high'+suffix).textContent=key==='surface'?'Land':fmt(s.hi)+' '+s.unit;
  $('gradient'+suffix).style.background=`linear-gradient(90deg,${(key==='surface'?[surfacePalette[12],surfacePalette[7],surfacePalette[2]]:palettes[s.palette]).join(',')})`;
 }
 $('empty').style.display=isField&&!latest?'flex':'none';
 if(isField&&!latest)return;
 if(['atmosphere','gas'].includes(activeTab))return;
 const a=latest?.fields,p=colors(s.palette),ctx=climateTexture.getContext('2d'),w=climateTexture.width,h=climateTexture.height,n=grid.cells;
 // Non-field layers always use the RFL Gaussian terrain; extreme estimates use
 // their explicitly separate equal-area latitude grid only for physical fields.
 const surface=isField?terrain:displayTerrain,columns=surface.width,rows=surface.rows;
 const sinLat=isField&&a?a.slice(7*n,7*n+grid.latitude):surface.sinLat;
 const lat=Array.from(sinLat,v=>Math.asin(Math.max(-1,Math.min(1,v)))*180/Math.PI);
 const edges=approx&&isField?Array.from({length:rows+1},(_,i)=>Math.asin(1-2*i/rows)*180/Math.PI):[90,...lat.slice(0,-1).map((v,i)=>(v+lat[i+1])/2),-90];
 const rgb=surfacePalette.map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)));
 let sum=0,weights=0;
 ctx.clearRect(0,0,w,h);
 for(let y=0;y<rows;y++){
  const top=(90-edges[y])/180*h,bottom=(90-edges[y+1])/180*h;
  for(let x=0;x<columns;x++){
   const ix=(x+columns/2)%columns,i=y*columns+ix,v=valueAt(i,key,surface),weight=isField&&a?a[7*n+grid.latitude+y]:surface.weights[y];sum+=v*weight;weights+=weight;
   if(key==='surface'){
    ctx.fillStyle=`rgb(${rgb[surface.indices[i]].join(',')})`;
   }else ctx.fillStyle=color((v-s.lo)/(s.hi-s.lo),p);
   ctx.fillRect(x*w/columns,top,w/columns+0.5,bottom-top+0.5);
   if(key!=='surface'&&!(approx&&isField)){
    const land=surface.land[i]>=.5,right=surface.land[y*columns+(ix+1)%columns]>=.5,below=y<rows-1?surface.land[i+columns]>=.5:land;
    ctx.strokeStyle='rgba(238,249,255,.38)';ctx.lineWidth=1;ctx.beginPath();if(land!==right){ctx.moveTo((x+1)*w/columns,top);ctx.lineTo((x+1)*w/columns,bottom);}if(land!==below){ctx.moveTo(x*w/columns,bottom);ctx.lineTo((x+1)*w/columns,bottom);}ctx.stroke();
   }
  }
 }
 // Ground stays separate so the globe can draw clouds above its silhouette.
 lastTexture=ctx.getImageData(0,0,w,h);
 lastCloudLayer=key==='surface'?getCloudLayer():null;
 if(activeTab==='planet')globe.draw(lastTexture,key!=='surface',lastCloudLayer,surfacePalette);
 if(activeTab==='climate'){
 let mapTexture=lastTexture;
 if(lastCloudLayer){paintCloudMap(ctx,lastCloudLayer,rgb,w,h);mapTexture=ctx.getImageData(0,0,w,h);}
 if(key==='wind'&&!approx){
  ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=1.5;
  const scale=resolutionScale();
  for(let y=2;y<rows-2;y+=3)for(let x=2;x<columns;x+=4){const i=y*columns+(x+columns/2)%columns,u=a[2*n+i],v=a[3*n+i],speed=Math.hypot(u,v);if(speed<.5)continue;const cx=(x+.5)*w/columns,cy=(90-lat[y])/180*h,len=(8+Math.min(speed,60)/6)*scale,dx=u/speed*len,dy=-v/speed*len;ctx.beginPath();ctx.moveTo(cx-dx/2,cy-dy/2);ctx.lineTo(cx+dx/2,cy+dy/2);ctx.lineTo(cx+dx/2-dx*.35-dy*.25,cy+dy/2-dy*.35+dx*.25);ctx.moveTo(cx+dx/2,cy+dy/2);ctx.lineTo(cx+dx/2-dx*.35+dy*.25,cy+dy/2-dy*.35-dx*.25);ctx.stroke();}
 }
 ctx.strokeStyle='rgba(9,18,33,.2)';ctx.lineWidth=1;
 for(const deg of [-60,-30,0,30,60]){const y=(90-deg)/180*h;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
 for(const deg of [-120,-60,0,60,120]){const x=(deg+180)/360*w;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
 const projection=$('projection').value,map=$('map');
 if(projection==='latlon'){
  if(map.width!==w||map.height!==h){map.width=w;map.height=h;}
  map.parentElement.style.aspectRatio='2';map.getContext('2d').drawImage(climateTexture,0,0);
 }else drawCubeMap(map,mapTexture,projection,256*resolutionScale());
 }
 $('mean').textContent=(approx&&s.unit==='bar'?fmt(sum/weights):(sum/weights).toFixed(1))+' '+s.unit;
 if(latest?.steps!==undefined)$('elapsed').textContent=(latest.steps*latest.dt/86400).toFixed(2)+' days';
}
$('field').onchange=()=>{syncLayers();render();};render();
$('download').onclick=()=>{
 if(!latest)return;
 const palette=atmospheres[runWorld.atmosphere],grid=currentGrid();
 if(latest.model==='surface-estimate'){
  const n=grid.cells,a=latest.fields,out={model:'Simplified steady grey surface energy balance',model_kind:latest.model,world_selection:runWorld,planet_tool:terrainExport(),config,
   notice:'Illustrative surface estimate, not ExoPlaSim output or a validated climate prediction.',assumptions:latest.assumptions,parameters:latest.parameters,statistics:latest.statistics,
   available_fields:['surface_temperature','surface_pressure'],unavailable_fields:['surface_air_temperature','cloud_cover','eastward_wind','northward_wind'],
   pressure_kind:runWorld.planet==='silicate'?'local illustrative rock vapor proxy':'prescribed uniform atmospheric pressure',
   atmosphere_palette:{type:runWorld.atmosphere,colors:palette.colors,notice:'Illustrative palette; not calculated sky colors.'},
   grid:{description:latest.grid.description,resolution:grid.preset,longitude: grid.longitude,latitude:grid.latitude,longitude_degrees:Array.from({length:grid.longitude},(_,i)=>i*360/grid.longitude),latitude_degrees:Array.from(a.slice(7*n,7*n+grid.latitude),v=>Math.asin(v)*180/Math.PI),latitude_weights:Array.from(a.slice(7*n+grid.latitude,7*n+2*grid.latitude))},
   units:{surface_temperature:'K',surface_pressure:'Pa'},fields:{surface_temperature:Array.from(a.slice(6*n,7*n)),surface_pressure:Array.from(a.slice(4*n,5*n))}};
  saveJSON(out,'extreme-surface-fields.json');return;
 }
 const a=latest.fields,n=grid.cells,out={model:'ExoPlaSim',port:'experimental single-core T'+grid.truncation+'L10 WebAssembly',run_status:state,world_selection:runWorld,planet_tool:terrainExport(),atmosphere_palette:{type:runWorld.atmosphere,colors:palette.colors,labels:palette.labels||['Horizon','Upper','Edge'],positions_percent:palette.positions||[0,48,82],space:palette.space||'#080e18',source:palette.source||null,notice:'Illustrative only; not simulated sky colors.'},notice:'Cold-start experiment; not an equilibrated or validated climate prediction.',config,namelists:ExoConfig.namelists(config,grid.preset),elapsed_earth_days:latest.steps*latest.dt/86400,grid:{resolution:grid.preset,longitude:grid.longitude,latitude:grid.latitude,longitude_degrees:Array.from({length:grid.longitude},(_,i)=>i*360/grid.longitude),latitude_degrees:Array.from(a.slice(7*n,7*n+grid.latitude),v=>Math.asin(v)*180/Math.PI),gaussian_weights:Array.from(a.slice(7*n+grid.latitude,7*n+2*grid.latitude)),array_order:'latitude-major, longitude-fastest; north to south; longitude 0° eastward'},units:{surface_air_temperature:'K',cloud_cover:'fraction',eastward_wind:'m/s',northward_wind:'m/s',surface_pressure:'Pa',land_fraction:'fraction',surface_temperature:'K'},fields:{}};
 ['surface_air_temperature','cloud_cover','eastward_wind','northward_wind','surface_pressure','land_fraction','surface_temperature'].forEach((k,i)=>out.fields[k]=Array.from(a.slice(i*n,(i+1)*n)));
 saveJSON(out,'exoplasim-fields.json');
};
function saveJSON(out,name){const url=URL.createObjectURL(new Blob([JSON.stringify(out)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
window.addEventListener('pagehide',()=>{stopWorker();clearReplay();cancelTerrain();});
const lifecycle=new AbortController();
if(document.modelContext?.registerTool){
 const definitions=[{name:'read_climate_run',description:'Read the climate run or extreme surface estimate status and selected field.',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{},additionalProperties:false},execute:()=>({state,config,resolution:currentGrid(),display_resolution:ExoConfig.displayResolution(surfaceResolution),cloud_source:cloudMode,world_selection:selection,climate_supported:support().supported,model_kind:support().mode||'appearance-only',field:$('field').value,elapsed_days:latest?.model==='surface-estimate'?null:latest?latest.steps*latest.dt/86400:0,global_mean:$('mean').textContent})},{name:'start_climate_run',description:'Calculate fields for the selected world. ExoPlaSim runs can take minutes; extreme surface estimates are instantaneous. Read the selected model first.',annotations:{readOnlyHint:false},inputSchema:{type:'object',properties:{flux:{type:'number',minimum:2,maximum:1800000},co2:{type:'number',minimum:10,maximum:2000},rotation:{type:'number',minimum:0.2,maximum:250},days:{type:'number',enum:[1,10,30,360]},pressure:{type:'number',minimum:0,maximum:150},albedo:{type:'number',minimum:0.05,maximum:0.85}},required:['flux','rotation'],additionalProperties:false},execute:input=>startRun(input)}];
 for(const tool of definitions)try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}

function terrainExport(){return {generator:terrain.generator||'quick',solver:terrain.generator==='solver'?{config:solverResult.config,statistics:solverResult.stats,ground_height_m:Array.from(terrain.height),water_surface_m:Array.from(terrain.water),biomes:Array.from(terrain.biomes)}:null,display_resolution:{preset:surfaceResolution,longitude:displayTerrain.width,latitude:displayTerrain.rows,cells:displayTerrain.land.length},source:terrain.generator==='solver'?'RFL C99 cubemap Terrain Solver, algorithm 2, WebAssembly':'RFL planet_tool.c terrestrial sampler',settings:runTerrain||terrainSettings,display_cloud_settings:{threshold:terrainSettings.cloudThreshold,frequency:terrainSettings.cloudFrequency,drift:terrainSettings.cloudDrift,shell_radius_ratio:CLOUD_RADIUS,detail:'Existing RFL 3D noise; each 2 × 2 High-res group preserves its climate cell mean coverage. Visual detail does not feed back into the solver.'},palette_rows:['land','coast','liquid','cloud'],palette:surfacePalette,cloud_source:cloudMode,grid:terrain.width+' longitude × '+terrain.rows+' Gaussian latitude; north to south; longitude 0° eastward',elevation_m:Array.from(terrain.elevation),land_mask:Array.from(terrain.land),terrain_affects_model:latest?.model!=='surface-estimate',colors_affect_albedo:false};}
function clearReplay(){clearInterval(replayTimer);replayTimer=null;playback.playing=false;}
function syncPlayback(){
 const frames=playback.all,shown=playback.current,approx=latest?.model==='surface-estimate';
 for(const panel of document.querySelectorAll('.playback')){
  const play=panel.querySelector('[data-action=play]');if(!play)continue;
  play.disabled=approx||state==='loading'||(!frames.length&&state!=='paused')||playback.playing||(state==='running'&&!playback.replaying);
  play.textContent=state==='paused'&&!playback.replaying?'▶ Resume simulation':state==='complete'||playback.replaying?'▶ Play replay':'▶ Play';
  panel.querySelector('[data-action=pause]').disabled=approx||!(state==='running'||playback.playing);
  panel.querySelector('[data-action=live]').disabled=!frames.length||!playback.replaying;
  const range=panel.querySelector('input');range.disabled=frames.length<2;range.max=Math.max(0,frames.length-1);range.value=playback.replaying?Math.min(playback.index,frames.length-1):Math.max(0,frames.length-1);
  panel.querySelector('output').textContent=shown?'Day '+(shown.steps*shown.dt/86400).toFixed(2):'No frames';
  panel.querySelector('.playback-status').textContent=approx?'Steady surface estimate · no time evolution':!frames.length?'Run the simulation to begin playback.':playback.playing?'Replaying saved climate frames':playback.replaying?'Replay paused · '+frames.length+' saved frames':state==='paused'?'Simulation paused · both views held':state==='running'?'Live simulation · both views synchronized':'Run complete · ready to replay';
 }
}
function playFrames(){
 if(state==='paused'&&!playback.replaying){togglePause();return;}
 if(!playback.all.length)return;
 clearReplay();playback.play();latest=playback.current;render();syncPlayback();
 replayTimer=setInterval(()=>{if(!playback.tick()){clearReplay();syncPlayback();return;}latest=playback.current;render();syncPlayback();},250/replaySpeed);
}
for(const panel of document.querySelectorAll('.playback')){
 const id=panel.dataset.view;
 panel.innerHTML=`<div class="playback-buttons"><button type="button" data-action="play">▶ Play</button><button type="button" data-action="pause">Ⅱ Pause</button><button type="button" data-action="live">Latest / live</button><select aria-label="${id==='map'?'Map':'Planet'} replay speed"><option value="0.5">0.5× replay</option><option value="1" selected>1× replay</option><option value="2">2× replay</option><option value="4">4× replay</option></select></div><label for="replay-${id}"><span>Time</span><input id="replay-${id}" type="range" min="0" max="0" step="1" value="0" disabled><output for="replay-${id}">No frames</output></label><p class="playback-status" aria-live="off"></p>`;
 panel.querySelector('[data-action=play]').onclick=playFrames;
 panel.querySelector('[data-action=pause]').onclick=()=>{clearReplay();if(state==='running')togglePause();syncPlayback();};
 panel.querySelector('[data-action=live]').onclick=()=>{clearReplay();playback.live();latest=playback.current;if(state==='paused')togglePause();render();syncPlayback();};
 panel.querySelector('input').oninput=e=>{clearReplay();if(state==='running')togglePause();latest=playback.seek(Number(e.target.value));render();syncPlayback();};
 panel.querySelector('select').onchange=e=>{replaySpeed=Number(e.target.value);for(const select of document.querySelectorAll('.playback select'))select.value=String(replaySpeed);if(playback.playing)playFrames();};
}
function showTab(name){
 activeTab=name;
 for(const tab of document.querySelectorAll('.workspace-nav [role=tab]')){const on=tab.id==='tab-'+name;tab.setAttribute('aria-selected',String(on));tab.tabIndex=on?0:-1;$(tab.getAttribute('aria-controls')).hidden=!on;}
 $('field-toolbar').hidden=$('field-help').hidden=['atmosphere','gas'].includes(name);
 $('rocky-settings').hidden=name==='gas';$('gas-settings').hidden=name!=='gas';
 syncGasMode();
 if(name!=='gas')updateResolutionNote();
 if(name==='gas')$('extreme-warning').hidden=true;
 else $('extreme-warning').hidden=!surfaceProfiles[selection.planet];
 if(!['atmosphere','gas'].includes(name))render();
}
const tabs=[...document.querySelectorAll('.workspace-nav [role=tab]')];
for(const tab of tabs){
 tab.onclick=()=>showTab(tab.id.slice(4));
 tab.onkeydown=e=>{let i=tabs.indexOf(tab);if(e.key==='ArrowRight')i=(i+1)%tabs.length;else if(e.key==='ArrowLeft')i=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')i=0;else if(e.key==='End')i=tabs.length-1;else return;e.preventDefault();tabs[i].focus();showTab(tabs[i].id.slice(4));};
}
for(const [id,key,format] of [['terrain-seed','seed',v=>v],['terrain-sea','sea',v=>v.toFixed(2)],['terrain-frequency','frequency',v=>v.toFixed(1)],['terrain-relief','relief',v=>v+' m']]){
 $(id).addEventListener('input',()=>{
  if(busy()||!$(id).checkValidity())return;
  if(latest)reset();
  terrainSettings=ExoTerrain.validate({...terrainSettings,[key]:Number($(id).value)});
  if(terrainGenerator==='solver'){markSolverDirty();return;}rebuildTerrain();
  if($(id+'-value'))$(id+'-value').textContent=format(terrainSettings[key]);render();
 });
}
async function randomizeSurface(){
 const result=randomSurface(terrainSettings);terrainSettings=ExoTerrain.validate(terrainGenerator==='quick'?result.settings:{...terrainSettings,seed:result.settings.seed});surfacePalette=result.palette;
 for(const [id,key] of [['terrain-seed','seed'],['terrain-sea','sea'],['terrain-frequency','frequency'],['terrain-relief','relief']])$(id).value=String(terrainSettings[key]);
 $('terrain-sea-value').textContent=terrainSettings.sea.toFixed(2);$('terrain-frequency-value').textContent=terrainSettings.frequency.toFixed(1);$('terrain-relief-value').textContent=terrainSettings.relief+' m';
 renderPalette();$('palette-status').textContent='New land, coast, liquid and cloud colors.';
 if(terrainGenerator==='solver')return await buildSolver();
 rebuildTerrain();render();return true;
}
function updateResolutionNote(){
 const mode=support().mode,display=ExoConfig.displayResolution(surfaceResolution);
 $('model-resolution').textContent=mode==='exoplasim'?'T21 · 64 × 32 · 10 levels':'64 × 32 · '+(mode==='surface-estimate'?'Surface estimate':'Terrain preview');
 $('resolution-note').textContent='Display: '+display.longitude+' × '+display.latitude+'. '+(mode==='exoplasim'?'Climate stays 64 × 32 at 30-minute steps. ':mode==='surface-estimate'?'Surface estimate stays 64 × 32. ':'')+(display.scale===2?'Four display cells per result. ':'')+'Changing resolution resets the simulation.';
}
$('surface-resolution').onchange=()=>{
 const next=$('surface-resolution').value;if(next===surfaceResolution)return;
 cancelTerrain();
 reset();surfaceResolution=next;rebuildTerrain();
 const scale=resolutionScale();climateTexture.width=1024*scale;climateTexture.height=512*scale;globe.setSize(256*scale);playback.limit=480;
 updateResolutionNote();
 $('status').textContent='Simulation reset · '+(scale===2?'high':'low')+' resolution ready';render();
 if(terrainGenerator==='solver'&&!solverReady())void buildSolver();
};
$('terrain-randomize').onclick=()=>{if(busy())return;if(latest)reset();terrainSettings={...terrainSettings,seed:crypto.getRandomValues(new Uint32Array(1))[0]};$('terrain-seed').value=String(terrainSettings.seed);if(terrainGenerator==='solver')void buildSolver();else{rebuildTerrain();render();}};

function generatorStatus(message,error=false){$('generator-status').textContent=message;$('generator-status').dataset.error=String(error);}
function cancelTerrain(){const request=terrainRequest;terrainRequest=null;request?.abort();lock(climateBusy());}
function markSolverDirty(){
 if(latest)reset();
 generatorStatus('Settings changed. Generate terrain to apply them; the previous map is shown.');
 lock(climateBusy());
}
function syncGenerator(){
 for(const tab of document.querySelectorAll('.generator-tabs [role=tab]')){
  const on=tab.id==='generator-tab-'+terrainGenerator;tab.setAttribute('aria-selected',String(on));tab.tabIndex=on?0:-1;$(tab.getAttribute('aria-controls')).hidden=!on;
 }
 $('quick-terrain-options').hidden=terrainGenerator!=='quick';$('solver-terrain-options').hidden=terrainGenerator!=='solver';
 $('solver-preset').value=solverSettings.preset;$('solver-resolution').value=String(solverSettings.macro_resolution);
 for(const [key,,,,step,unit] of solverKnobs){const input=$('solver-'+key);if(input){input.value=String(solverSettings[key]);$('solver-'+key+'-value').textContent=solverSettings[key].toFixed(step<.01?3:step<.1?2:step<1?1:0)+unit;}}
 lock(climateBusy());
}
async function buildSolver(){
 if(climateBusy()||terrainGenerator!=='solver')return false;
 if(!$('terrain-seed').checkValidity()){$('terrain-seed').reportValidity();return false;}
 cancelTerrain();if(latest)reset();
 if(solverReady()){rebuildTerrain();render();generatorStatus('Terrain Solver ready.');lock(false);return true;}
 const request=new AbortController(),key=solverKey();terrainRequest=request;lock(false);
 const timeout=setTimeout(()=>request.abort('timeout'),60000);
 try{
  const result=await generateSolver(solverSettings,terrainSettings.seed,{signal:request.signal,onStatus:message=>{if(terrainRequest===request)generatorStatus(message+' Previous map is shown.');}});
  if(terrainRequest!==request||terrainGenerator!=='solver'||solverKey()!==key)return false;
  solverResult=result;solverResultKey=key;terrainRequest=null;rebuildTerrain();
  generatorStatus('Terrain Solver ready · '+result.stats.lakes+' lakes.');
  $('solver-details').textContent=result.config.macro_resolution+' × '+result.config.macro_resolution+' terrain cells per cube face · '+result.stats.lakes+' lakes. Broad slope limits '+(result.stats.max_macro_slope_excess_m<1e-6?'met.':'have a remaining conflict.')+' Fine roughness can be steeper. Climate stays 64 × 32.';
  render();return true;
 }catch(error){
  if(terrainRequest!==request)return false;
  generatorStatus(request.signal.reason==='timeout'?'Terrain generation timed out. Try 32 or 64 terrain detail; the previous map is shown.':error.name==='AbortError'?'Generation cancelled. The previous map is shown.':errorMessage(error)+' Previous map is shown; no new terrain was applied.',true);
  return false;
 }finally{clearTimeout(timeout);if(terrainRequest===request)terrainRequest=null;lock(climateBusy());}
}
async function selectGenerator(next){
 if(climateBusy()||next===terrainGenerator)return;
 cancelTerrain();if(latest)reset();terrainGenerator=next;syncGenerator();
 if(next==='solver')await buildSolver();
 else{rebuildTerrain();render();generatorStatus('Quick heightmap ready.');}
}
const generatorTabs=[...document.querySelectorAll('.generator-tabs [role=tab]')];
for(const tab of generatorTabs){
 tab.onclick=()=>void selectGenerator(tab.id.slice('generator-tab-'.length));
 tab.onkeydown=e=>{
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();
  const i=e.key==='Home'?0:e.key==='End'?1:1-generatorTabs.indexOf(tab);generatorTabs[i].focus();generatorTabs[i].click();
 };
}
for(const [key,label,min,max,step] of solverKnobs){
 const node=document.createElement('label');node.htmlFor='solver-'+key;
 node.append(document.createTextNode(label+' '));const output=document.createElement('output');output.id='solver-'+key+'-value';node.append(output);
 const input=document.createElement('input');input.id='solver-'+key;input.type='range';input.min=min;input.max=max;input.step=step;input.value=solverSettings[key];node.append(input);
 input.oninput=()=>{if(busy())return;solverSettings={...solverSettings,[key]:Number(input.value)};markSolverDirty();syncGenerator();};$('solver-knobs').append(node);
}
$('solver-preset').onchange=()=>{if(busy())return;solverSettings=solverPreset($('solver-preset').value);markSolverDirty();syncGenerator();};
$('solver-resolution').onchange=()=>{if(busy())return;solverSettings={...solverSettings,macro_resolution:Number($('solver-resolution').value)};markSolverDirty();};
$('solver-generate').onclick=()=>void buildSolver();
$('generator-cancel').onclick=()=>{cancelTerrain();generatorStatus('Generation cancelled. The previous map is shown.');};
syncGenerator();
$('cloud-source').onclick=()=>{cloudMode=cloudMode==='original'?'simulation':'original';$('field').value='surface';syncLayers();render();};
$('cloud-amount').oninput=()=>{terrainSettings={...terrainSettings,cloudThreshold:Number($('cloud-amount').value)};$('cloud-amount-value').textContent=terrainSettings.cloudThreshold.toFixed(2);render();};
function renderPalette(){
 renderPaletteSprite();
 $('palette-grid').replaceChildren(...['Land','Coast','Liquid','Clouds'].map((name,row)=>{
  const group=document.createElement('div');group.className='palette-row';const title=document.createElement('span');title.textContent=name;group.append(title);
  for(let x=0;x<5;x++){const i=row*5+x,label=document.createElement('label'),input=document.createElement('input'),value=document.createElement('span');label.className='palette-cell';input.type='color';input.value=surfacePalette[i];input.setAttribute('aria-label',`${name} shade ${x+1}`);value.textContent=surfacePalette[i].toUpperCase();input.oninput=()=>{surfacePalette[i]=input.value;value.textContent=input.value.toUpperCase();selectedPalettePixel=i;renderPaletteSprite();render();};label.append(input,value);group.append(label);}return group;
 }));
}
function saveAsset(bytes,name,type){const url=URL.createObjectURL(new Blob([bytes],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('palette-bmp').onclick=()=>saveAsset(paletteBmp(surfacePalette),'rfl-terrestrial-palette.bmp','image/bmp');
$('palette-xpm').onclick=()=>saveAsset(paletteXpm(surfacePalette),'rfl-terrestrial-palette.xpm','image/x-xpixmap');
$('palette-reset').onclick=()=>{surfacePalette=[...ExoTerrain.palette];renderPalette();render();$('palette-status').textContent='RFL default colors restored.';};
$('palette-import').onclick=()=>$('palette-file').click();
$('palette-file').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{const colors=await readPaletteFile(file);surfacePalette=colors;selectedPalettePixel=0;renderPalette();render();$('palette-status').textContent='Opened '+file.name+' · select a pixel to edit.';}
 catch(error){$('palette-status').textContent=errorMessage(error);}finally{e.target.value='';}
};
function renderPaletteSprite(){
 const canvas=$('palette-sprite');canvas.width=5;canvas.height=4;
 const ctx=canvas.getContext('2d'),image=ctx.createImageData(5,4);image.data.set(palettePixels(surfacePalette));ctx.putImageData(image,0,0);
 const row=Math.floor(selectedPalettePixel/5),column=selectedPalettePixel%5,name=['Land','Coast','Liquid','Clouds'][row]+' · shade '+(column+1);
 $('palette-sprite-cursor').style.left=column*20+'%';$('palette-sprite-cursor').style.top=row*25+'%';
 $('palette-selected').textContent=name;canvas.setAttribute('aria-label','Editable palette sprite. '+name+' selected.');
 $('palette-color').value=surfacePalette[selectedPalettePixel];$('palette-hex').value=surfacePalette[selectedPalettePixel].toUpperCase();
}
$('palette-sprite').onclick=e=>{
 const rect=$('palette-sprite').getBoundingClientRect(),x=Math.max(0,Math.min(4,Math.floor((e.clientX-rect.left)/rect.width*5))),y=Math.max(0,Math.min(3,Math.floor((e.clientY-rect.top)/rect.height*4)));
 selectedPalettePixel=y*5+x;renderPaletteSprite();
};
$('palette-sprite').onkeydown=e=>{
 let x=selectedPalettePixel%5,y=Math.floor(selectedPalettePixel/5);
 if(e.key==='ArrowLeft')x=Math.max(0,x-1);else if(e.key==='ArrowRight')x=Math.min(4,x+1);else if(e.key==='ArrowUp')y=Math.max(0,y-1);else if(e.key==='ArrowDown')y=Math.min(3,y+1);else if(e.key==='Home'){x=0;y=0;}else if(e.key==='End'){x=4;y=3;}else if(e.key==='Enter'||e.key===' '){e.preventDefault();$('palette-color').click();return;}else return;
 e.preventDefault();selectedPalettePixel=y*5+x;renderPaletteSprite();
};
function editPalettePixel(value){
 if(!/^#[0-9a-f]{6}$/i.test(value))return false;
 surfacePalette[selectedPalettePixel]=value.toLowerCase();renderPalette();render();$('palette-status').textContent='Updated '+$('palette-selected').textContent+'.';return true;
}
$('palette-color').oninput=e=>editPalettePixel(e.target.value);
$('palette-hex').oninput=e=>{if(/^#[0-9a-f]{6}$/i.test(e.target.value))editPalettePixel(e.target.value);};
$('palette-hex').onchange=e=>{if(!editPalettePixel(e.target.value)){$('palette-status').textContent='Use a six-digit hex color, such as #D2EEFF.';renderPaletteSprite();}};
$('palette-edit').onclick=()=>{$('palette-title').scrollIntoView({block:'start'});$('palette-sprite').focus({preventScroll:true});};
$('palette-png').onclick=()=>$('palette-sprite').toBlob(blob=>{if(blob)saveAsset(blob,'rfl-terrestrial-palette.png','image/png');else $('palette-status').textContent='The palette PNG could not be saved.';},'image/png');
renderPalette();syncPlayback();syncLayers();updateResolutionNote();

$('projection').onchange=render;
