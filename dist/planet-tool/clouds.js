import '../terrain.js';

// A deliberately oversized visual shell, not a modeled cloud altitude.
export const CLOUD_RADIUS=1.14;
const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};

// Keep the model's coverage as the mean of its display children. Only their
// appearance changes: no perturbations or feedback enter the climate solver.
export function distributeCoverage(coverage,noise){
 const target=clamp(coverage),count=noise.length;
 if(!count)return [];
 if(target===0||target===1||count===1)return noise.map(()=>target);
 // Shift the existing noise threshold until these samples match the coarse
 // coverage. A short soft edge keeps the mask from flickering as it drifts.
 const edge=.04;
 let lo=Math.min(...noise)-edge,hi=Math.max(...noise);
 for(let step=0;step<28;step++){
  const threshold=(lo+hi)/2,mean=noise.reduce((sum,value)=>sum+smooth((value-threshold)/edge),0)/count;
  if(mean>target)lo=threshold;else hi=threshold;
 }
 const threshold=(lo+hi)/2;
 return noise.map(value=>smooth((value-threshold)/edge));
}

export function createCloudLayer(settings,mode,frame,scale=1){
 if(![1,2].includes(scale))throw new Error('Unknown cloud display resolution.');
 if(mode==='simulation'&&(!frame||frame.model==='surface-estimate'))return null;
 const grid=ExoTerrain.gaussianGrid(32),columns=64,rows=32,width=columns*scale,height=rows*scale;
 const lat=Array.from(grid.sinLat,Math.asin),baseEdges=[Math.PI/2,...lat.slice(0,-1).map((v,i)=>(v+lat[i+1])/2),-Math.PI/2];
 const edges=new Float64Array(height+1),alpha=new Float32Array(width*height),shades=new Uint8Array(width*height);
 // Split each original cell in two on each axis, including at the poles.
 for(let y=0;y<height;y++){const row=Math.floor(y/scale),q=y%scale/scale;edges[y]=baseEdges[row]+(baseEdges[row+1]-baseEdges[row])*q;}
 edges[height]=-Math.PI/2;
 const time=frame?.steps?frame.steps*frame.dt/86400:0;
 if(mode==='simulation'&&(frame.grid?.cells!==2048||frame.grid.longitude!==64||frame.grid.latitude!==32))throw new Error('Cloud detail needs the original 64 × 32 climate grid.');
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
  const samples=[],indices=[];
  for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){
   const row=y*scale+dy,col=x*scale+dx,index=row*width+col;
   // Use the map's longitude cell convention for matching field overlays.
   const lon=(x+(dx+.5)/scale)*2*Math.PI/columns,latitude=(edges[row]+edges[row+1])/2;
   samples.push(ExoTerrain.cloudNoise(lon,latitude,settings,time));indices.push(index);
  }
  const coverage=mode==='simulation'?distributeCoverage(frame.fields[2048+y*columns+x],samples):samples.map(n=>smooth((n-settings.cloudThreshold)/.14)*.9);
  indices.forEach((index,i)=>{
   alpha[index]=coverage[i];
   shades[index]=Math.min(4,Math.floor(clamp((samples[i]-.2)/.55)*4.999));
  });
 }
 return {width,height,alpha,shades,edges,radius:CLOUD_RADIUS,mode};
}

export function cloudIndex(layer,lon,lat){
 const u=((lon/(2*Math.PI))%1+1)%1;
 let lo=0,hi=layer.height;
 while(lo+1<hi){const mid=(lo+hi)>>1;if(lat>layer.edges[mid])hi=mid;else lo=mid;}
 return lo*layer.width+Math.min(layer.width-1,Math.floor(u*layer.width));
}

export function paintCloudMap(ctx,layer,colors,width,height){
 if(!layer)return;
 const cellWidth=width/layer.width;
 // Longitude zero lies in the middle of the map.
 for(let y=0;y<layer.height;y++){
  const top=(Math.PI/2-layer.edges[y])/Math.PI*height,bottom=(Math.PI/2-layer.edges[y+1])/Math.PI*height;
  for(let x=0;x<layer.width;x++){
   const i=y*layer.width+x,alpha=layer.alpha[i];if(alpha<=0)continue;
   const rgb=colors[15+layer.shades[i]],left=((x/layer.width+.5)%1+1)%1*width;
   ctx.fillStyle=`rgba(${rgb.join(',')},${alpha})`;
   ctx.fillRect(left,top,cellWidth,bottom-top);
   if(left+cellWidth>width)ctx.fillRect(left-width,top,cellWidth,bottom-top);
  }
 }
}
