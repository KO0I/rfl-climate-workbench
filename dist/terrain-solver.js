const base=new URL('./',import.meta.url);
export const solverDefaults={preset:'balanced',macro_resolution:64,continent_frequency:3.2,sea_threshold:-.06,
 noise_mix:.25,warp_strength:.22,land_relief_m:9000,detail_amplitude_m:100,max_macro_slope:.015,region_strength:0};
export const solverKnobs=[
 ['continent_frequency','Continent detail',.5,12,.1,''],
 ['sea_threshold','Liquid threshold',-.6,.6,.01,''],
 ['noise_mix','Noise blend',0,1,.05,''],
 ['warp_strength','Coastline warp',0,1,.01,''],
 ['land_relief_m','Noise relief',0,12000,100,' m'],
 ['detail_amplitude_m','Fine roughness',0,500,10,' m'],
 ['max_macro_slope','Maximum macro slope',.001,.05,.001,' m/m'],
 ['region_strength','Regional variation',0,1,.05,''],
];
export function solverPreset(preset){
 const settings={...solverDefaults,preset};
 if(preset==='archipelago')Object.assign(settings,{continent_frequency:6,sea_threshold:.08,warp_strength:.35,land_relief_m:4500});
 else if(preset==='alpine')Object.assign(settings,{sea_threshold:-.18,max_macro_slope:.025});
 else if(preset==='regional')Object.assign(settings,{macro_resolution:128,noise_mix:.35,region_strength:1});
 else if(preset!=='balanced')throw new Error('Unknown Terrain Solver preset.');
 return settings;
}
async function asset(name,binary,signal){
 const response=await fetch(new URL(name,base),{credentials:'same-origin',signal});
 if(!response.ok)throw new Error('Could not load Terrain Solver. Reopen the site or try again.');
 if(/html/i.test(response.headers.get('content-type')||''))throw new Error('Terrain Solver received a sign-in page. Reopen the site and try again.');
 const value=await (binary?response.arrayBuffer():response.text());
 if(binary){const magic=new Uint8Array(value,0,Math.min(4,value.byteLength));if(magic.join(',')!=='0,97,115,109')throw new Error('Terrain Solver download is incomplete. Try again.');}
 else if(!value.trim()||/^\s*</.test(value))throw new Error('Terrain Solver script is incomplete. Try again.');
 return value;
}
export async function generateSolver(settings,seed,{signal,onStatus=()=>{}}){
 if(typeof Worker!=='function'||typeof WebAssembly!=='object')throw new Error('Terrain Solver needs a browser with WebAssembly and background workers.');
 onStatus('Loading Terrain Solver…');
 const names=['terrain.js','terrain-solver-engine.js','terrain-solver-data.js','terrain-solver-worker.js'];
 const assets=await Promise.all([...names.map(name=>asset(name,false,signal)),asset('terrain-solver-engine.wasm',true,signal)]);
 if(signal.aborted)throw new DOMException('Terrain generation cancelled.','AbortError');
 const url=URL.createObjectURL(new Blob(assets.slice(0,4).flatMap(source=>[source,'\n;\n']),{type:'text/javascript'}));
 let worker;
 try{
  worker=new Worker(url,{name:'Terrain Solver'});
  return await new Promise((resolve,reject)=>{
   const cancel=()=>reject(new DOMException('Terrain generation cancelled.','AbortError'));
   signal.addEventListener('abort',cancel,{once:true});
   const cleanup=()=>signal.removeEventListener('abort',cancel);
   worker.onmessage=({data})=>{
    if(data.type==='status')onStatus(data.message);
    else if(data.type==='result'){cleanup();resolve(data.result);}
    else if(data.type==='error'){cleanup();reject(new Error(data.message));}
   };
   worker.onerror=event=>{event.preventDefault();cleanup();reject(new Error(event.message||'Terrain Solver stopped. Try a lower terrain resolution.'));};
   worker.onmessageerror=()=>{cleanup();reject(new Error('Could not receive the generated terrain. Try again.'));};
   const wasmBinary=assets[4];worker.postMessage({settings,seed,wasmBinary},[wasmBinary]);
  });
 }finally{worker?.terminate();URL.revokeObjectURL(url);}
}
