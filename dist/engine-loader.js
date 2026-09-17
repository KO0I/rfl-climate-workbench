// Load through the page's authenticated session. Some embedded browsers cannot
// load protected scripts or data from a worker's separate request context.
const assetBase=new URL('./',import.meta.url);
import './model-config.js';

export function errorMessage(error,fallback='The climate engine stopped unexpectedly. Reset and try again.'){
 const message=typeof error==='string'?error:error?.message;
 return typeof message==='string'&&message.trim()&&!['undefined','null'].includes(message.trim())?message:fallback;
}

async function readAsset(name,kind,signal){
 let response;
 try{response=await fetch(new URL(name,assetBase),{credentials:'same-origin',signal});}
 catch(error){if(signal.aborted)throw error;throw new Error(`Could not download ${name}. Check your connection, then try again.`);}
 if(response.status===401||response.status===403)throw new Error('Your session could not load the climate engine. Reopen this site, sign in if asked, and try again.');
 if(!response.ok)throw new Error(`Could not download ${name} (HTTP ${response.status}). Try again.`);
 const type=response.headers.get('content-type')||'';
 if(/html/i.test(type))throw new Error(`The site returned a web page instead of ${name}. Reopen this site and try again.`);
 if(kind==='script'){
  const source=await response.text();
  if(!source.trim()||/^\s*</.test(source))throw new Error(`The ${name} download is not a valid engine script. Reload and try again.`);
  return source;
 }
 const bytes=await response.arrayBuffer();
 if(!bytes.byteLength)throw new Error(`The ${name} download is empty. Reload and try again.`);
 if(kind==='wasm'){
  const magic=new Uint8Array(bytes,0,Math.min(4,bytes.byteLength));
  if(magic.length!==4||magic[0]!==0||magic[1]!==97||magic[2]!==115||magic[3]!==109)throw new Error('The climate engine download is damaged. Reload and try again.');
 }
 return bytes;
}

export async function loadClimateEngine(signal,preset='low'){
 const {engine:stem}=ExoConfig.resolution(preset);
 if(typeof Worker!=='function')throw new Error('This browser cannot start background simulations. Open the site in Safari, Firefox, or Chrome.');
 if(typeof WebAssembly!=='object')throw new Error('WebAssembly is unavailable in this browser. Open the site in a browser with WebAssembly enabled.');
 const [configuration,terrain,engine,worker,wasmBinary,modelData]=await Promise.all([
  readAsset('model-config.js','script',signal),readAsset('terrain.js','script',signal),readAsset(stem+'.js','script',signal),readAsset('worker.js','script',signal),
  readAsset(stem+'.wasm','wasm',signal),readAsset(stem+'.data','data',signal)
 ]);
 if(signal.aborted)throw new DOMException('Simulation loading was cancelled.','AbortError');
 // Classic scripts share one worker global; no eval, importScripts, or worker
 // fetches are needed. The numerical model still runs entirely in the worker.
 const workerURL=URL.createObjectURL(new Blob([configuration,'\n;\n',terrain,'\n;\n',engine,'\n;\n',worker],{type:'text/javascript'}));
 return {workerURL,wasmBinary,modelData};
}
