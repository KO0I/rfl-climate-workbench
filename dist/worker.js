'use strict';
let model=null, ptr=0, steps=0, target=0, dt=1800, paused=false, timer=null, initialized=false;
let grid=null,NHOR=0,COUNT=0;
let logLines=[], startClock=0, runningMs=0;
function log(line){logLines.push(String(line));if(logLines.length>100)logLines.shift();}
function post(type,extra={}){self.postMessage({type,...extra});}
function diagnostic(){
  if(!model)return '';
  try{model._browser_flush();return model.FS.readFile('/model/plasim_diag',{encoding:'utf8'}).slice(-7000);}catch{return '';}
}
function fail(e){clearTimeout(timer);paused=true;const message=(typeof e==='string'&&e.trim()?e:e?.message)||(e?.errno?`The model could not read a required file (error ${e.errno}). Reload and try again.`:'The climate engine stopped unexpectedly. Reset and try again.');post('error',{message,log:[message,diagnostic(),...logLines].filter(Boolean).join('\n')});}
self.addEventListener('error',event=>{event.preventDefault();fail(event.error||event);});
self.addEventListener('unhandledrejection',event=>{event.preventDefault();fail(event.reason);});
function frame(){
  model._browser_fields(ptr);
  const fields=model.HEAPF32.slice(ptr/4,ptr/4+COUNT);
  if(fields[7*NHOR+2*grid.latitude+2]>0)throw new Error('The model stopped after detecting an unstable atmosphere. Reset and try less extreme parameters.');
  for(let i=0;i<7*NHOR;i++)if(!Number.isFinite(fields[i]))throw new Error('The model produced a non-finite field. This run is invalid.');
  const duration=runningMs+(paused?0:performance.now()-startClock);
  self.postMessage({type:'frame',fields,steps,target,dt,grid,runningMs:duration},[fields.buffer]);
}
function chunk(){
  if(paused||!initialized)return;
  try{
    const stop=performance.now()+70;
    do{model._browser_step();steps++;}while(steps<target && steps%12!==0 && performance.now()<stop);
    frame();
    if(steps>=target){runningMs+=performance.now()-startClock;paused=true;post('complete',{log:diagnostic()});return;}
    timer=setTimeout(chunk,0);
  }catch(e){fail(e);}
}
self.onmessage=async({data})=>{
 try{
  if(data.type==='start'){
    if(model||initialized)throw new Error('Reset before starting a new run.');
    const config=ExoConfig.validate(data.config);
    grid=ExoConfig.resolution();NHOR=grid.cells;COUNT=7*NHOR+2*grid.latitude+4;
    post('status',{message:'Loading the climate engine…'});
    if(!(data.wasmBinary instanceof ArrayBuffer)||!(data.modelData instanceof ArrayBuffer))throw new Error('The climate engine files did not reach the simulation. Reset and try again.');
    model=await createExoPlaSim({noInitialRun:true,wasmBinary:new Uint8Array(data.wasmBinary),
      getPreloadedPackage:(_name,size)=>{if(data.modelData.byteLength!==size)throw new Error('The climate boundary data download is incomplete. Reload and try again.');return data.modelData;},
      locateFile:p=>p,print:log,printErr:log});
    if(model._browser_nlat?.()!==grid.latitude)throw new Error('The loaded climate engine does not match the selected resolution. Reload the site and try again.');
    model.FS.chdir('/model');
    for(const [name,text] of Object.entries(ExoConfig.namelists(config,grid.preset)))model.FS.writeFile(name,text);
    if(data.terrainGrid||data.terrain){
      if(data.terrainGrid&&(data.terrainGrid.width!==grid.longitude||data.terrainGrid.rows!==grid.latitude))throw new Error('Generated terrain does not match the climate resolution.');
      const boundary=data.terrainGrid?ExoTerrain.boundaryFromTerrain(data.terrainGrid):ExoTerrain.boundaryFiles(data.terrain,grid.longitude);
      for(const name of model.FS.readdir('.'))if(/^N\d{3}_surf_\d+\.sra$/.test(name))model.FS.unlink(name);
      for(const [name,text] of Object.entries(boundary.files))model.FS.writeFile(name,text);
      log((data.terrainGrid?.generator==='solver'?'Terrain Solver':'RFL quick')+' terrain applied: custom land mask and elevation; Earth surface climatology removed.');
    }
    post('status',{message:'Initializing the atmosphere…'});
    model._browser_init();
    ptr=model._malloc(COUNT*4);
    if(!ptr)throw new Error('Unable to allocate the output buffer.');
    model._browser_fields(ptr);
    dt=model.HEAPF32[ptr/4+7*NHOR+2*grid.latitude+1];
    if(!(dt>0&&Number.isFinite(dt)))throw new Error('Invalid model timestep.');
    target=Math.ceil(config.days*86400/dt);initialized=true;paused=false;startClock=performance.now();
    post('ready',{dt,target,grid});chunk();
  }else if(data.type==='pause'&&initialized&&!paused){
    paused=true;clearTimeout(timer);runningMs+=performance.now()-startClock;frame();post('paused');
  }else if(data.type==='resume'&&initialized&&paused&&steps<target){
    paused=false;startClock=performance.now();post('resumed');chunk();
  }
 }catch(e){fail(e);}
};
post('booted');
