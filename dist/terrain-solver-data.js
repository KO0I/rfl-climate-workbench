/* Classic script shared by the worker and numerical checks. */
(function(scope){
 'use strict';
 function sample(model,lon,lat){
  const r=Math.cos(lat),ptr=model._ts_sample(r*Math.sin(lon),Math.sin(lat),r*Math.cos(lon));
  if(!ptr)throw new Error('Terrain Solver could not sample this direction.');
  return model.HEAPF64.subarray(ptr/8,ptr/8+7);
 }
 function grid(model,width){
  const rows=width/2,count=width*rows,{sinLat,weights}=ExoTerrain.gaussianGrid(rows);
  const land=new Float32Array(count),elevation=new Float32Array(count),height=new Float32Array(count),
   water=new Float32Array(count),indices=new Uint8Array(count),biomes=new Uint8Array(count);
  for(let y=0;y<rows;y++)for(let x=0;x<width;x++){
   const i=y*width+x,s=sample(model,x*2*Math.PI/width,Math.asin(sinLat[y]));
   if(!s.every(Number.isFinite))throw new Error('Terrain Solver produced an invalid height.');
   height[i]=s[0];water[i]=s[1];land[i]=s[2]?0:1;biomes[i]=s[3];
   // ExoPlaSim wants the exposed surface, including elevated lakes, not the sea floor.
   elevation[i]=Math.max(0,s[2]?s[1]:s[0]);
   const shade=s[4]%5;
   indices[i]=s[2]?10+shade:s[3]===3?5+shade:shade;
  }
  return {generator:'solver',width,rows,land,elevation,height,water,indices,biomes,sinLat,weights};
 }
 function overview(model,rows){
  const width=rows*2,elevation=new Float32Array(width*rows);
  for(let y=0;y<rows;y++)for(let x=0;x<width;x++){
   const s=sample(model,(x/width-.5)*2*Math.PI,(.5-(y+.5)/rows)*Math.PI);
   elevation[y*width+x]=Math.max(0,s[2]?s[1]:s[0]);
  }
  return {width,rows,elevation};
 }
 function generate(model,settings,seed,status=()=>{}){
  const checked=ok=>{if(!ok)throw new Error(model.UTF8ToString(model._ts_error())||'Terrain constraints could not be solved.');};
  checked(model.ccall('ts_configure','number',['string'],[settings.preset]));
  for(const [key,value] of Object.entries({...settings,seed})){
   if(key==='preset')continue;
   checked(model.ccall('ts_set','number',['string','string'],[key,String(value)]));
  }
  status('Solving coastlines, ridges and lake levels…');
  checked(model._ts_build());
  try{
   const stats=JSON.parse(model.UTF8ToString(model._ts_stats())),config=JSON.parse(model.UTF8ToString(model._ts_config()));
   status('Sampling the planet and climate heightmaps…');
   const low=grid(model,64),high=grid(model,128),overviewLow=overview(model,64),overviewHigh=overview(model,128);
   let maxElevation=100;
   for(const data of [low,high,overviewLow,overviewHigh])for(const value of data.elevation)maxElevation=Math.max(maxElevation,value);
   return {low,high,overviewLow,overviewHigh,maxElevation:Math.ceil(maxElevation/100)*100,stats,config};
  }finally{model._ts_destroy();}
 }
 scope.TerrainSolverData={sample,grid,overview,generate};
})(globalThis);
