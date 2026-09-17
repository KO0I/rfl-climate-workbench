import './xpm-glass-optics.js';
import {SATURN_LAYERS,WATER_LAYER,CORE_LAYER,clamp,rgb} from './saturn-layers.js';
const {dielectricFresnel,traceDielectricSphere}=globalThis.XpmGlassOptics;
const TAU=Math.PI*2,EPS=1e-5;

function frame(yaw,pitch){
 const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
 return {point:(x,y,z)=>[cy*x+sy*(sp*y+cp*z),cp*y-sp*z,-sy*x+cy*(sp*y+cp*z)],
  vector:n=>[cy*n[0]-sy*n[2],sy*sp*n[0]+cp*n[1]+cy*sp*n[2],sy*cp*n[0]-sp*n[1]+cy*cp*n[2]]};
}
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

// Intersect actual concentric volumes and their section planes. There is no
// screen-space mask: the section walls turn with the globe and occlude by depth.
export function makeGeometry(width,height,{yaw=.45,pitch=-.42,opening=105,removed=[0,0,0,0,0],rings=true,coreRatio=12/26,zoom=1,layerDefinitions=SATURN_LAYERS}={}){
 const WATER_LAYER=layerDefinitions.findIndex(l=>l.id==='water'),CORE_LAYER=layerDefinitions.findIndex(l=>l.id==='metal'),transparentLayer=layerDefinitions.findIndex(l=>l.id==='hydrogen');
 const radius=Math.min(width/(rings?3.88:2.5),height/2.45)*zoom,f=frame(yaw,pitch),dir=f.point(0,0,1),n=width*height;
 const radii=layerDefinitions.map(l=>l.radius);radii[CORE_LAYER]=radii[WATER_LAYER]*coreRatio;
 const layers=radii.map(()=>({z:new Float32Array(n).fill(-Infinity),uv:new Float32Array(n*2),shade:new Float32Array(n),face:new Uint8Array(n)}));
 const ringZ=new Float32Array(n).fill(-Infinity),ringR=new Float32Array(n),nx=new Float32Array(n),ny=new Float32Array(n);
 for(let py=0;py<height;py++)for(let px=0;px<width;px++){
  const p=py*width+px,x=(px+.5-width/2)/radius,y=(height/2-py-.5)/radius,r2=x*x+y*y,base=f.point(x,y,0);nx[p]=x;ny[p]=y;
  if(rings&&Math.abs(dir[1])>.025){const z=-base[1]/dir[1],rx=base[0]+z*dir[0],rz=base[2]+z*dir[2],rr=Math.hypot(rx,rz);
   if(rr>1.22&&rr<1.86&&!(rr>1.59&&rr<1.66)){ringZ[p]=z;ringR[p]=rr;}}
  if(r2>1)continue;
  for(let j=0;j<radii.length;j++){
   const removal=removed[j]||0,outer=radii[j],inner=radii[j+1]||0;
   if(removal>=.9999||r2>outer*outer)continue;
   const angle=(opening+(360-opening)*removal)*Math.PI/180,cutY=-outer*removal;
   const hasCut=j!==CORE_LAYER&&(angle>EPS),allAngles=angle>TAU-EPS;
   const isCut=(wx,wy,wz)=>hasCut&&wy>cutY&&(allAngles||((Math.atan2(wx,wz)+TAU)%TAU)<angle);
   const inside=z=>{const rr=r2+z*z;return rr<=outer*outer&&rr>=inner*inner&&!isCut(base[0]+dir[0]*z,base[1]+dir[1]*z,base[2]+dir[2]*z);};
   const roots=[[Math.sqrt(outer*outer-r2),0],[-Math.sqrt(outer*outer-r2),0]];
   if(inner*inner>r2){const z=Math.sqrt(inner*inner-r2);roots.push([z,1],[-z,1]);}
   const planes=[[0,1,0],[1,0,0],[Math.cos(angle),0,-Math.sin(angle)]];
   if(hasCut)for(let k=0;k<planes.length;k++){
    if(allAngles&&k>0)continue;
    const denom=dot(planes[k],dir);if(Math.abs(denom)<EPS)continue;
    roots.push([((k===0?cutY:0)-dot(planes[k],base))/denom,k+2]);
   }
   let zBest=-Infinity,kind=0;
   for(const [z,k] of roots)if(z>zBest&&inside(z-EPS)&&!inside(z+EPS)){zBest=z;kind=k;}
   if(!Number.isFinite(zBest))continue;
   const wx=base[0]+dir[0]*zBest,wy=base[1]+dir[1]*zBest,wz=base[2]+dir[2]*zBest,len=Math.hypot(wx,wy,wz);
   let normal=kind>1?f.vector(planes[kind-2]):[x/(kind===1?-inner:outer),y/(kind===1?-inner:outer),zBest/(kind===1?-inner:outer)];
   if(kind>1&&normal[2]<0)normal=normal.map(v=>-v);
   const layer=layers[j];layer.z[p]=zBest;layer.uv[p*2]=(Math.atan2(wx,wz)+Math.PI)/TAU;layer.uv[p*2+1]=.5-Math.asin(clamp(wy/(len||1),-1,1))/Math.PI;
   layer.shade[p]=kind>1?.78+.22*Math.max(0,dot(normal,[-.35,.45,.82])):.32+.68*Math.max(0,dot(normal,[-.35,.45,.82]));layer.face[p]=kind>1?1:0;
  }
 }
 return {width,height,radius,radii,layers,ringZ,ringR,nx,ny,yaw,pitch,waterLayer:WATER_LAYER,coreLayer:CORE_LAYER,transparentLayer};
}

export function environment(nx,ny,nz,roughness,mode='studio'){
 const ry=2*ny*nz,rx=2*nx*nz,rz=2*nz*nz-1;
 const horizon=.5+.5*Math.tanh((ry+.12)*9/(1+roughness*8));
 const band=Math.exp(-Math.pow((ry-.12-rx*.2)/(.08+roughness*.5),2));
 const box=Math.pow(Math.max(0,-rx*.5+ry*.62+rz*.56),12/(1+roughness*4));
 const bright=mode==='space'?38:166,dark=mode==='space'?7:24;
 return [0,1,2].map(k=>dark+(bright-dark)*horizon+band*(85-k*4)+box*155);
}
function texel(texture,u,v){
 const x=((Math.floor(u*texture.width)%texture.width)+texture.width)%texture.width,y=Math.max(0,Math.min(texture.height-1,Math.floor(v*texture.height))),i=(y*texture.width+x)*4;
 return [texture.data[i],texture.data[i+1],texture.data[i+2]];
}
function sample(source,width,height,x,y,channel){
 const ix=clamp(Math.round(x),0,width-1),iy=clamp(Math.round(y),0,height-1);return source[(iy*width+ix)*4+channel];
}

export function paintSaturn(geometry,textures,configs,{environment:env='studio',time=0,infrared=false}={}){
 const {width,height,radius,radii,layers,ringZ,ringR,nx,ny}=geometry,n=width*height;
 const {waterLayer:WATER_LAYER=3,coreLayer:CORE_LAYER=4,transparentLayer=-1}=geometry;
 const data=new Uint8ClampedArray(n*4),depth=new Float32Array(n).fill(-Infinity),owner=new Int8Array(n).fill(-1),tints=configs.map(c=>rgb(c.color));
 const emission=configs[CORE_LAYER].emission||0,emissionColor=rgb(configs[CORE_LAYER].emissionColor||'#000000'),glow=1-Math.exp(-emission);
 const transmittedEmission=emission?new Float32Array(n):null;
 for(let p=0;p<n;p++){
  const i=p*4,x=nx[p],y=ny[p],r2=x*x+y*y;
  const star=((p*73856093^Math.floor(p/width)*19349663)>>>0)%12031===0;
  data[i]=star?115:7;data[i+1]=star?128:13;data[i+2]=star?150:23;data[i+3]=255;
  let best=-1,zBest=-Infinity;
  for(let j=0;j<layers.length;j++)if(j!==WATER_LAYER&&j!==transparentLayer&&layers[j].z[p]>zBest){zBest=layers[j].z[p];best=j;}
  if(best>=0){
   depth[p]=zBest;owner[p]=best;
   const layer=layers[best];let color;
   if(best===CORE_LAYER){
    const r=radii[CORE_LAYER],cx=x/r,cy=y/r,cz=Math.sqrt(Math.max(0,1-cx*cx-cy*cy)),c=configs[best];
    const reflected=environment(cx,cy,cz,c.scatter,env),sheen=Math.exp(-Math.pow((cy-(.08+cx*.22))/ (.105+c.scatter*.15),2));
    color=reflected.map((v,k)=>v*c.reflection+tints[best][k]*(1-c.reflection)*(.4+cz*.6)+sheen*28);
    if(emission){
     color=color.map((v,k)=>v*(1-glow*.42)+emissionColor[k]*glow*(.85+.15*cz));
     transmittedEmission[p]=emission*(.85+.15*cz);
    }
   }else{
    color=texel(textures[best],layer.uv[p*2],layer.uv[p*2+1]);
    const face=layer.face[p];
    color=color.map((v,k)=>(face?v*.32+tints[best][k]*.68:v)*layer.shade[p]);
    if(face){const r=Math.sqrt(r2+zBest*zBest);if(Math.abs(r-radii[best])<.009||Math.abs(r-radii[best+1])<.008)color=color.map(v=>v*.65+90);}
   }
   for(let k=0;k<3;k++)data[i+k]=color[k];
  }
  if(ringZ[p]>zBest){
   const r=ringR[p],grain=.62+.16*Math.sin(r*345)+.14*Math.sin(r*773),shadow=ringZ[p]<0&&Math.abs(x)<.86?.28:1;
   const color=infrared?[29,51,248]:[185,164,123];
   for(let k=0;k<3;k++)data[i+k]=color[k]*grain*shadow;
   depth[p]=ringZ[p];owner[p]=layers.length;
   if(transmittedEmission)transmittedEmission[p]=0;
  }
 }
 // A translucent hydrogen envelope keeps Jupiter's central emission visible.
 // Composite it over the core, then let the outer glass refract both together.
 if(transparentLayer>=0){
  const layer=layers[transparentLayer],config=configs[transparentLayer];
  for(let p=0;p<n;p++){
   if(!Number.isFinite(layer.z[p])||layer.z[p]<depth[p])continue;
   const color=texel(textures[transparentLayer],layer.uv[p*2],layer.uv[p*2+1]);
   const alpha=clamp(config.opacity*(layer.face[p]?1.5:1)),i=p*4;
   for(let k=0;k<3;k++)data[i+k]=data[i+k]*(1-alpha)+color[k]*alpha*layer.shade[p];
   if(transmittedEmission)transmittedEmission[p]*=1-alpha;
   depth[p]=layer.z[p];owner[p]=transparentLayer;
  }
 }
 if(emission){
  for(let p=0;p<n;p++){
   // Only visible transparent material scatters the glow; opaque clouds occlude it.
   const glassVisible=Number.isFinite(layers[WATER_LAYER].z[p])&&layers[WATER_LAYER].z[p]>=depth[p];
   if(!glassVisible&&owner[p]!==transparentLayer)continue;
   const distance=Math.hypot(nx[p],ny[p])/radii[CORE_LAYER],halo=glow*.22*Math.exp(-Math.max(0,distance-1)*2);
   for(let k=0;k<3;k++)data[p*4+k]+=emissionColor[k]*halo;
  }
 }
 // The shell follows XPM Workbench's neutral-mood glass and Beer absorption.
 // Sampling the first pass refracts the already shaded, nested mirror core.
 // Preserve emission above display white while transporting it through glass.
 // Clipping it to the first-pass byte buffer would extinguish the warm glow.
 const source=emission?new Float32Array(data):data.slice(),water=layers[WATER_LAYER],c=configs[WATER_LAYER],r=radii[WATER_LAYER];
 if(emission)for(let p=0;p<n;p++)for(let k=0;k<3;k++)source[p*4+k]+=emissionColor[k]*transmittedEmission[p]*1.65;
 for(let p=0;p<n;p++){
  const z=water.z[p];if(!Number.isFinite(z)||z<depth[p])continue;
  const i=p*4,px=p%width,py=Math.floor(p/width),x=nx[p]/r,y=ny[p]/r,normalZ=Math.sqrt(Math.max(0,1-x*x-y*y));
  if(water.face[p]){
   const frost=.10+c.scatter*.22,base=texel(textures[WATER_LAYER],water.uv[p*2],water.uv[p*2+1]);
   for(let k=0;k<3;k++)data[i+k]=source[i+k]*(1-frost)+base[k]*frost+10;owner[p]=WATER_LAYER;continue;
  }
  const trace=traceDielectricSphere([x,y,normalZ],c.ior);
  const fresnel=dielectricFresnel(normalZ,1,c.ior),reflection=clamp(fresnel+c.reflection*(.10+.5*Math.pow(1-normalZ,1.7)));
  const reflected=environment(x,y,normalZ,c.scatter,env),bend=1-Math.min(.46,(c.ior-1)*.31)*normalZ*normalZ;
  const sampleX=width/2+(px-width/2)*bend,sampleY=height/2+(py-height/2)*bend,spread=c.dispersion*(.45+(1-bend)*radius*r*.55)*normalZ;
  const transmission=Math.exp(-c.absorption*trace.pathLength*1.3);
  const clouds=texel(textures[WATER_LAYER],water.uv[p*2],water.uv[p*2+1]),highlight=Math.pow(Math.max(0,-x*.38+y*.4+normalZ*.83),30/(1+c.scatter*5));
  const grain=(((px*73856093^py*19349663)>>>0)%101)/100;
  for(let k=0;k<3;k++){
   const shift=(1-k)*spread;
   const transmitted=sample(source,width,height,sampleX+x*shift,sampleY-y*shift,k);
   const fog=c.scatter*(.1+normalZ*.28)*(.88+grain*.24);
   let value=(transmitted*transmission+(tints[WATER_LAYER][k]*.3)*(1-transmission))*(1-reflection)+reflected[k]*reflection;
   // Jupiter's colored shell scatters tinted light instead of neutral white fog.
   const scatterLight=transparentLayer>=0?tints[WATER_LAYER][k]*.6:230;
   value=value*(1-fog)+scatterLight*fog;
   const cloudWeight=c.cloudOpacity*(.1+Math.abs(clouds[k]-130)/210);
   value=value*(1-cloudWeight)+clouds[k]*cloudWeight+highlight*55*(1-c.scatter*.55);
   data[i+k]=value;
  }
  owner[p]=WATER_LAYER;
 }
 return {width,height,data,owner};
}
