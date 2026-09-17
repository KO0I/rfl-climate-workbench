'use strict';
self.onmessage=async({data})=>{
 try{
  const model=await createTerrainSolver({wasmBinary:new Uint8Array(data.wasmBinary),noInitialRun:true,print:()=>{},printErr:()=>{}});
  const result=TerrainSolverData.generate(model,data.settings,data.seed,message=>self.postMessage({type:'status',message}));
  const transfer=[];
  for(const grid of [result.low,result.high,result.overviewLow,result.overviewHigh])
   for(const value of Object.values(grid))if(ArrayBuffer.isView(value))transfer.push(value.buffer);
  self.postMessage({type:'result',result},transfer);
 }catch(error){self.postMessage({type:'error',message:error?.message||'Terrain Solver could not complete this world.'});}
};
