// Streamlines sample the selected ExoPlaSim snapshot, never decorative noise.
// Cloud traces use column coverage and lowest-level wind, not cloud-height wind.
const TAU=2*Math.PI,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const wrapLongitude=lon=>((lon+Math.PI)%TAU+TAU)%TAU-Math.PI;
export function windSampler(frame){
 const g=frame?.grid,a=frame?.fields;
 if(!g||!a||(frame.model==='surface-estimate'&&!frame.availableFields?.includes('wind'))||g.longitude<2||g.latitude<2||a.length<7*g.cells+g.latitude)return null;
 const w=g.longitude,h=g.latitude,n=g.cells,lat=Array.from(a.slice(7*n,7*n+h),v=>Math.asin(clamp(v,-1,1)));
 if(lat.some((v,i)=>!Number.isFinite(v)||(i&&v>=lat[i-1])))return null;
 return (lon,latitude)=>{
  // ExoPlaSim longitude zero is the first sample; rows are Gaussian, north first.
  const x=((lon/TAU)%1+1)%1*w,x0=Math.floor(x),x1=(x0+1)%w,fx=x-x0;
  let lo=0,hi=h-1;
  while(lo+1<hi){const m=(lo+hi)>>1;if(latitude>lat[m])hi=m;else lo=m;}
  const fy=clamp((lat[lo]-latitude)/(lat[lo]-lat[hi]),0,1);
  const sample=offset=>{
   const top=a[offset+lo*w+x0]*(1-fx)+a[offset+lo*w+x1]*fx;
   const bottom=a[offset+hi*w+x0]*(1-fx)+a[offset+hi*w+x1]*fx;
   return top*(1-fy)+bottom*fy;
  };
  const u=sample(2*n),v=sample(3*n),cloud=sample(n);
  return Number.isFinite(u)&&Number.isFinite(v)&&Number.isFinite(cloud)?{u,v,speed:Math.hypot(u,v),cloud:clamp(cloud,0,1)}:null;
 };
}
export function sphereStep(lon,lat,u,v,scale){
 // Advance in the sphere's tangent basis; no singular 1/cos(latitude) at poles.
 const sl=Math.sin(lon),cl=Math.cos(lon),sp=Math.sin(lat),cp=Math.cos(lat);
 const x=cp*sl+scale*(u*cl-v*sp*sl),y=sp+scale*v*cp,z=cp*cl+scale*(-u*sl-v*sp*cl);
 return [Math.atan2(x,z),Math.asin(clamp(y/Math.hypot(x,y,z),-1,1))];
}
export function traceStreamlines(sample,count=190,offset=0){
 if(!sample)return [];
 const paths=[];
 for(let seed=0;seed<count;seed++){
  let lon=wrapLongitude((seed+offset)*2.399963229728653),lat=Math.asin(1-2*(seed+.5)/count);
  const points=[];
  for(let k=0;k<48;k++){
   const f=sample(lon,lat);if(!f||f.speed<.05)break;
   points.push({lon,lat,...f});
   // Midpoint integration, bounded angular distance; display timing is arbitrary.
   const step=.013/Math.max(8,f.speed),mid=sphereStep(lon,lat,f.u,f.v,step/2),m=sample(...mid);
   if(!m)break;[lon,lat]=sphereStep(lon,lat,m.u,m.v,step);
  }
  if(points.length>2){points.seed=seed;paths.push(points);}
 }
 return paths;
}
export function projectGlobe(point,globe,radius=1){
 const {lon,lat}=point,cp=Math.cos(globe.pitch),sp=Math.sin(globe.pitch),cy=Math.cos(globe.yaw),sy=Math.sin(globe.yaw);
 const x=point.x??Math.cos(lat)*Math.sin(lon),y=point.y??Math.sin(lat),z=point.z??Math.cos(lat)*Math.cos(lon);
 const nx=cy*x-sy*z,zz=sy*x+cy*z,ny=cp*y+sp*zz,nz=-sp*y+cp*zz;
 if(nz<=.025)return null;
 return {x:globe.size/2+nx*globe.radius*radius,y:globe.size/2-ny*globe.radius*radius,face:'sphere'};
}
export function projectMap(point,projection,width,height){
 const lon=point.x===undefined?point.lon:Math.atan2(point.x,point.z),lat=point.y===undefined?point.lat:Math.asin(clamp(point.y,-1,1));
 if(projection==='latlon')return {x:(wrapLongitude(lon)/TAU+.5)*width,y:(.5-lat/Math.PI)*height,face:'map'};
 const x=point.x??Math.cos(lat)*Math.sin(lon),y=point.y??Math.sin(lat),z=point.z??Math.cos(lat)*Math.cos(lon);
 const all=projection==='cube',ax=Math.abs(x),ay=Math.abs(y),az=Math.abs(z);
 const face=all?(ax>=ay&&ax>=az?(x>=0?'px':'nx'):ay>=az?(y>=0?'py':'ny'):(z>=0?'pz':'nz')):projection;
 const d=face==='px'?x:face==='nx'?-x:face==='py'?y:face==='ny'?-y:face==='pz'?z:-z;
 if(d<=0)return null;
 const [u,v]=face==='px'?[-z/d,-y/d]:face==='nx'?[z/d,-y/d]:face==='py'?[x/d,z/d]:face==='ny'?[x/d,-z/d]:face==='pz'?[x/d,-y/d]:[-x/d,-y/d];
 if(Math.abs(u)>1.00001||Math.abs(v)>1.00001)return null;
 const positions={nx:[0,1],pz:[1,1],px:[2,1],nz:[3,1],py:[1,0],ny:[1,2]},[col,row]=all?positions[face]:[0,0],size=all?width/4:width;
 return {x:col*size+(u+1)/2*(size-1),y:row*size+(v+1)/2*(size-1),face};
}

const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);},TRANSITION_SECONDS=.4;
const flowRate=path=>Math.min(1.2,.18+path[0].speed/65);
function pointAlong(points,phase){
 let lo=0,hi=points.length-1;
 while(lo+1<hi){const m=(lo+hi)>>1;if(points[m].progress>phase)hi=m;else lo=m;}
 const a=points[lo],b=points[hi],f=clamp((phase-a.progress)/(b.progress-a.progress),0,1);
 return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,cloud:a.cloud+(b.cloud-a.cloud)*f};
}
export function streamlineMarker(points,phase,animate=true){
 const start=points[0].progress,end=points.at(-1).progress;
 // Progress belongs to the original spherical path, not a visible fragment.
 if(phase<start||phase>end)return null;
 const p=pointAlong(points,phase),a=pointAlong(points,Math.max(start,phase-.025)),b=pointAlong(points,Math.min(end,phase+.025));
 const fade=animate?smooth((phase-start)/.08)*smooth((end-phase)/.08):1;
 return {...p,angle:Math.atan2(b.y-a.y,b.x-a.x),opacity:fade};
}

// Match stable seed IDs and interpolate positions on the sphere before projection.
// Unit-vector interpolation takes the short route across longitude seams and poles.
function spherePoint(p){
 return {...p,x:p.x??Math.cos(p.lat)*Math.sin(p.lon),y:p.y??Math.sin(p.lat),z:p.z??Math.cos(p.lat)*Math.cos(p.lon)};
}
function blendPoint(a,b,t,out={}){
 const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,z=a.z+(b.z-a.z)*t,length=Math.hypot(x,y,z);
 // Each trace is < 0.63 radians long from a fixed seed, so matching points
 // cannot be antipodal. Normalize to stay on the sphere, never through it.
 out.x=x/length;out.y=y/length;out.z=z/length;
 out.cloud=a.cloud+(b.cloud-a.cloud)*t;out.speed=a.speed+(b.speed-a.speed)*t;
 return out;
}
function resamplePath(path){
 if(path.normalized)return path;
 const points=path.map(spherePoint),distance=[0];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];
  distance.push(distance[i-1]+Math.acos(clamp(a.x*b.x+a.y*b.y+a.z*b.z,-1,1)));
 }
 const total=distance.at(-1),result=[];let j=1;
 for(let i=0;i<48;i++){
  const d=total*i/47;while(j<points.length-1&&distance[j]<d)j++;
  const t=(d-distance[j-1])/(distance[j]-distance[j-1]||1);
  result.push(blendPoint(points[j-1],points[j],clamp(t,0,1)));
 }
 result.seed=path.seed;result.opacity=path.opacity??1;result.normalized=true;return result;
}
export function morphStreamlines(from,to){
 const paths={wind:[],cloud:[]},tracks=[];
 for(const kind of ['wind','cloud']){
  const previous=new Map(from[kind].map(p=>[p.seed,p])),next=new Map(to[kind].map(p=>[p.seed,p]));
  for(const seed of new Set([...previous.keys(),...next.keys()])){
   const old=previous.get(seed),fresh=next.get(seed);
   const a=resamplePath(old||fresh),b=resamplePath(fresh||old);
   const path=a.map(p=>({...p}));path.seed=seed;path.normalized=true;path.opacity=old?(old.opacity??1):0;
   paths[kind].push(path);tracks.push({a,b,path,start:old?(old.opacity??1):0,end:fresh?1:0});
  }
 }
 return {paths,at(t){
  t=clamp(t,0,1);
  for(const {a,b,path,start,end} of tracks){
   path.opacity=start+(end-start)*t;
   for(let i=0;i<path.length;i++)blendPoint(a[i],b[i],t,path[i]);
  }
  return paths;
 }};
}

// Display-only geometry morphs; scientific fields and exports stay untouched.
export class SurfaceStreamlines{
 constructor(map,planet,host=globalThis){
  this.host=host;
  this.canvases={climate:map,planet};this.frame=null;this.paths={wind:[],cloud:[]};this.layers=[];this.markers=new Map();this.raf=0;this.last=null;this.transition=null;
  this.tick=t=>{
   this.raf=0;if(!this.options||this.host.document.hidden){this.last=null;return;}
   const dt=this.last===null?0:clamp((t-this.last)/1000,0,.05);this.last=t;
   for(const marker of this.markers.values()){
    marker.rate+=(marker.targetRate-marker.rate)*(1-Math.exp(-dt*8));
    marker.phase=(marker.phase+dt*marker.rate)%1;
   }
   if(this.transition){
    this.transition.age+=dt;
    this.target.paths=this.transition.at(smooth(this.transition.age/this.transition.duration));
    if(this.transition.age>=this.transition.duration)this.settle();
    this.reproject();
   }
   this.draw();this.schedule();
  };
  host.document.addEventListener('visibilitychange',()=>{this.stop();if(!this.host.document.hidden)this.schedule();});
  host.window.addEventListener('pagehide',()=>this.stop());
 }
 stop(){this.host.cancelAnimationFrame(this.raf);this.raf=0;this.last=null;}
 schedule(){
  if(this.options?.animate&&!this.host.document.hidden&&['climate','planet'].includes(this.options.view)&&(this.options.wind||this.options.cloud)&&(this.transition||this.layers.some(layer=>layer.projected.length))){
   if(!this.raf)this.raf=this.host.requestAnimationFrame(this.tick);
  }else this.stop();
 }
 settle(){this.transition=null;if(this.target)this.target.paths=this.paths;}
 reproject(){
  for(const layer of this.layers)layer.projected=this.project(layer.paths);
  this.projected=this.target?.projected||[];
 }
 update(frame,options){
  this.options=options;
  if(frame!==this.frame){
   this.frame=frame;const sample=windSampler(frame);this.paths={wind:traceStreamlines(sample).map(resamplePath),cloud:traceStreamlines(sample,125,.47).map(resamplePath)};
   for(const kind of ['wind','cloud'])for(const path of this.paths[kind]){
    const id=kind+':'+path.seed,rate=flowRate(path),marker=this.markers.get(id);
    if(marker)marker.targetRate=rate;
    else this.markers.set(id,{phase:(path.seed*.61803398875+(kind==='cloud'?.47:0))%1,rate,targetRate:rate});
   }
   if(this.target&&sample){
    // Rebase interruptions on exactly what is currently displayed, not the
    // previous destination. Keep just one shape per seed, even in fast replay.
    this.transition=morphStreamlines(this.target.paths,this.paths);
    this.transition.age=0;this.transition.duration=clamp(options?.transitionSeconds??TRANSITION_SECONDS,.06,.6);
    this.target.paths=this.transition.at(0);
   }else{
    this.transition=null;this.target=sample?{paths:this.paths,projected:[],opacity:1}:null;
   }
   this.layers=this.target?[this.target]:[];
   if(!sample)this.markers.clear();
  }
  // Stationary/reduced-motion views show the exact selected snapshot immediately.
  if(!options?.animate||!['climate','planet'].includes(options?.view)||this.host.document.hidden||(!options?.wind&&!options?.cloud))this.settle();
  for(const [view,canvas] of Object.entries(this.canvases)){
   const base=options?.bases?.[view];if(base&&(canvas.width!==base.width||canvas.height!==base.height)){canvas.width=base.width;canvas.height=base.height;}
   canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  }
  this.reproject();
  const canvas=this.canvases[options?.view];
  if(canvas)this.scale=Math.max(.7,canvas.width/(options.view==='planet'?400:1024));
  this.draw();this.schedule();
 }
 project(paths){
  const options=this.options,projected=[];
  if(!options||!['climate','planet'].includes(options.view))return projected;
  const canvas=this.canvases[options.view];
  for(const kind of ['wind','cloud']){
   if(!options[kind])continue;
   for(const path of paths[kind]){
    if(path.opacity===0||(kind==='cloud'&&path.every(p=>p.cloud<=.04)))continue;
    let segment=[];
    const flush=()=>{if(segment.length>1)projected.push({kind,id:kind+':'+path.seed,points:segment,opacity:path.opacity??1});segment=[];};
    for(let i=0;i<path.length;i++){
     const p=path[i];
     const q=options.view==='planet'?projectGlobe(p,options.globe,kind==='cloud'&&options.shell?1.14:1.008):projectMap(p,options.projection,canvas.width,canvas.height);
     if(!q||(kind==='cloud'&&p.cloud<=.04)){flush();continue;}
     const prev=segment.at(-1);
     if(prev&&(q.face!==prev.face||Math.hypot(q.x-prev.x,q.y-prev.y)>canvas.width*.12))flush();
     segment.push({x:q.x,y:q.y,face:q.face,speed:p.speed,cloud:p.cloud,progress:i/(path.length-1)});
    }
    flush();
   }
  }
  return projected;
 }
 draw(){
  const o=this.options,canvas=this.canvases[o?.view];if(!canvas)return;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.lineCap='round';ctx.lineJoin='round';
  for(const layer of this.layers){
   if(layer.opacity<=0)continue;
   for(const {kind,id,points:p,opacity} of layer.projected){
   const cloud=kind==='cloud',color=cloud?'#ffffff':'#68ecdf',coverage=p[Math.floor(p.length/2)].cloud;
   const alpha=opacity*(cloud?smooth((coverage-.04)/.16):1);if(alpha<=0)continue;
   ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);for(let j=1;j<p.length;j++)ctx.lineTo(p[j].x,p[j].y);
   ctx.globalAlpha=alpha*(cloud?.22+.40*coverage:.45);ctx.strokeStyle='#071425';ctx.lineWidth=(cloud?4:3)*this.scale;ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=(cloud?2.3:1.25)*this.scale;ctx.stroke();
   const phase=o.animate?this.markers.get(id).phase:(p[0].progress+p.at(-1).progress)/2,b=streamlineMarker(p,phase,o.animate);
   if(!b||b.opacity<=0)continue;
   const {angle}=b,len=4*this.scale;
   ctx.globalAlpha=alpha*b.opacity*(cloud?.5+.5*b.cloud:.95);ctx.strokeStyle=color;ctx.lineWidth=1.5*this.scale;
   ctx.beginPath();ctx.moveTo(b.x-len*Math.cos(angle-.55),b.y-len*Math.sin(angle-.55));ctx.lineTo(b.x,b.y);ctx.lineTo(b.x-len*Math.cos(angle+.55),b.y-len*Math.sin(angle+.55));ctx.stroke();
   }
  }
  ctx.globalAlpha=1;
 }
}
