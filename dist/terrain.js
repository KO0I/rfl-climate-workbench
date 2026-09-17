/* Terrestrial sampler ported from RFL planet_tool.c: hash3, vnoise, fbm,
 * terrain_idx and DEF_PAL. Original source is in model/rfl-planet-tool.
 * Palette indices and physical elevation are independent of display colors.
 */
(function(scope){
 'use strict';
 const F=Math.fround, clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), frac=v=>F(v-Math.floor(v));
 const defaults={seed:0,sea:0.45,frequency:3,relief:3000,cloudThreshold:0.48,cloudFrequency:2.2,cloudDrift:0.03};
 const palette=[[.04,.16,.04],[.06,.26,.06],[.10,.38,.10],[.20,.55,.16],[.45,.75,.30],
 [.45,.26,.08],[.62,.36,.12],[.78,.48,.18],[.88,.62,.30],[.95,.78,.50],
 [.02,.05,.18],[.03,.10,.30],[.05,.18,.45],[.08,.30,.60],[.20,.50,.75],
 [.45,.47,.52],[.62,.64,.68],[.78,.80,.83],[.90,.91,.93],[1,1,1]].map(rgb=>'#'+rgb.map(v=>Math.trunc(F(F(v)*255)).toString(16).padStart(2,'0')).join(''));
 function validate(input={}){
  const c={...defaults,...input},limits={seed:[0,4294967295],sea:[0.15,0.75],frequency:[0.5,6],relief:[0,5000],cloudThreshold:[0.2,0.75],cloudFrequency:[0.2,8],cloudDrift:[-0.3,0.3]};
  for(const [key,[lo,hi]] of Object.entries(limits))if(!Number.isFinite(c[key])||c[key]<lo||c[key]>hi)throw new Error('Invalid planet tool '+key+'.');
  if(!Number.isInteger(c.seed))throw new Error('Terrain seed must be a whole number.');
  if(Object.keys(c).some(k=>!limits[k]))throw new Error('Unknown planet tool setting.');
  return c;
 }
 function hash3(x,y,z){
  let px=frac(F(F(x*F(.3183099))+F(.71))),py=frac(F(F(y*F(.3183099))+F(.113))),pz=frac(F(F(z*F(.3183099))+F(.419)));
  px=F(px*17);py=F(py*17);pz=F(pz*17);
  return frac(F(F(F(px*py)*pz)*F(F(px+py)+pz)));
 }
 const mix=(a,b,t)=>F(a+F(F(b-a)*t));
 function noise(x,y,z){
  x=F(x);y=F(y);z=F(z);
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
  const smooth=v=>F(F(v*v)*F(3-F(2*v)));
  const fx=smooth(F(x-ix)),fy=smooth(F(y-iy)),fz=smooth(F(z-iz));
  return mix(mix(mix(hash3(ix,iy,iz),hash3(ix+1,iy,iz),fx),mix(hash3(ix,iy+1,iz),hash3(ix+1,iy+1,iz),fx),fy),
   mix(mix(hash3(ix,iy,iz+1),hash3(ix+1,iy,iz+1),fx),mix(hash3(ix,iy+1,iz+1),hash3(ix+1,iy+1,iz+1),fx),fy),fz);
 }
 function fbm(x,y,z){let a=.5,s=0;for(let i=0;i<4;i++){s=F(s+F(a*noise(x,y,z)));x=F(x*F(2.02));y=F(y*F(2.02));z=F(z*F(2.02));a=F(a*.5);}return s;}
 function offsets(seed){return seed===0?[0,0,0]:[(seed&1023)/37,((seed>>>10)&1023)/41,((seed>>>20)&4095)/43];}
 function heightAt(lon,lat,c){const r=Math.cos(lat),o=offsets(c.seed);return fbm(F(r*Math.sin(lon)*c.frequency+o[0]),F(Math.sin(lat)*c.frequency+o[1]),F(r*Math.cos(lon)*c.frequency+o[2]));}
 function paletteIndex(h,sea){const coast=sea+.04;return h<sea?10+Math.floor(clamp(h/sea,0,1)*4.999):h<coast?5+Math.floor(clamp((h-sea)/.04,0,1)*4.999):Math.floor(clamp((h-coast)/(.9375-coast),0,1)*4.999);}
 function gaussianGrid(n=32){
  const sinLat=new Float64Array(n),weights=new Float64Array(n);
  for(let i=0;i<n/2;i++){
   let z=Math.cos(Math.PI*(i+.75)/(n+.5)),derivative;
   for(let j=0;j<30;j++){let p=1,prev=0;for(let k=1;k<=n;k++){const p0=prev;prev=p;p=((2*k-1)*z*prev-(k-1)*p0)/k;}derivative=n*(z*p-prev)/(z*z-1);const delta=p/derivative;z-=delta;if(Math.abs(delta)<1e-15)break;}
   sinLat[i]=z;sinLat[n-1-i]=-z;weights[i]=weights[n-1-i]=2/((1-z*z)*derivative*derivative);
  }return {sinLat,weights};
 }
 const grids=new Map([[32,gaussianGrid(32)],[64,gaussianGrid(64)]]);
 function generate(input,width=64){
  if(![64,128].includes(width))throw new Error('Unknown terrain resolution.');
  const rows=width/2,grid=grids.get(rows),settings=validate(input),count=width*rows,land=new Float32Array(count),elevation=new Float32Array(count),height=new Float32Array(count),indices=new Uint8Array(count);
  for(let y=0;y<rows;y++)for(let x=0;x<width;x++){
   const i=y*width+x,h=heightAt(x*2*Math.PI/width,Math.asin(grid.sinLat[y]),settings);
   height[i]=h;land[i]=h>=settings.sea?1:0;
   elevation[i]=Math.max(0,(h-settings.sea)/(.9375-settings.sea))*settings.relief;
   indices[i]=paletteIndex(h,settings.sea);
  }
  return {settings,width,rows,land,elevation,height,indices,sinLat:grid.sinLat,weights:grid.weights};
 }
 function sra(code,values,width,rows){
  let text=[code,0,20070101,0,width,rows,0,0].join(' ')+'\n';
  for(let i=0;i<values.length;i+=8)text+=Array.from(values.slice(i,i+8),v=>Number(v).toExponential(8)).join(' ')+'\n';
  return text;
 }
 function boundaryFiles(input,width=64){
  return boundaryFromTerrain(generate(input,width));
 }
 function boundaryFromTerrain(terrain){
  const {land,elevation,sinLat,rows,width}=terrain;
  if(![64,128].includes(width)||rows!==width/2||land?.length!==width*rows||elevation?.length!==width*rows||sinLat?.length!==rows)throw new Error('Terrain does not match the climate grid.');
  const expected=grids.get(rows).sinLat;
  for(let y=0;y<rows;y++)if(!Number.isFinite(sinLat[y])||Math.abs(sinLat[y]-expected[y])>1e-12)throw new Error('Terrain latitude coordinates do not match the climate grid.');
  for(let i=0;i<land.length;i++)if((land[i]!==0&&land[i]!==1)||!Number.isFinite(elevation[i])||elevation[i]<0||elevation[i]>100000)throw new Error('Terrain has an invalid surface height or land mask.');
  const fill=fn=>Float32Array.from({length:width*rows},(_,i)=>fn(i)),temperature=fill(i=>Math.max(235,300-55*sinLat[Math.floor(i/width)]**2-.006*elevation[i]));
  // Replace every bundled Earth-specific boundary field. Colors remain artistic;
  // land/ocean thermal properties and albedo are explicit physical defaults.
  const arrays={129:fill(i=>elevation[i]*9.80665),172:land,169:temperature,
   173:fill(i=>land[i]>.5?.1:.001),1730:fill(()=>.001),174:fill(i=>land[i]>.5?.2:.07),
   1740:fill(()=>.2),1741:fill(()=>.2),199:fill(()=>0),200:fill(()=>0),
   210:fill(i=>!land[i]&&temperature[i]<271.25?1:0),212:fill(()=>0),229:fill(i=>land[i]>.5?.5:0),232:fill(()=>0)};
  return {terrain,files:Object.fromEntries(Object.entries(arrays).map(([code,data])=>['N'+String(rows).padStart(3,'0')+'_surf_'+code.padStart(4,'0')+'.sra',sra(Number(code),data,width,rows)]))};
 }
 function cloudNoise(lon,lat,c,time=0){const r=Math.cos(lat);return fbm(F(r*Math.sin(lon)*c.cloudFrequency+time*c.cloudDrift),F(Math.sin(lat)*c.cloudFrequency),F(r*Math.cos(lon)*c.cloudFrequency));}
 function originalCloud(lon,lat,c,time=0){const h=cloudNoise(lon,lat,c,time),t=clamp((h-c.cloudThreshold)/.14,0,1);return t*t*(3-2*t)*.9;}
 scope.ExoTerrain={defaults,palette,validate,hash3,fbm,heightAt,paletteIndex,gaussianGrid,generate,boundaryFiles,boundaryFromTerrain,cloudNoise,originalCloud};
})(globalThis);
