// Reference-inspired cloud-top appearance, with prescribed advection rather
// than a fluid solver. All views sample this one periodic, deterministic field.
import {clamp} from './saturn-layers.js';
const TAU=2*Math.PI,DEG=Math.PI/180,W=1024,H=512;
const wrap=x=>x-TAU*Math.floor((x+Math.PI)/TAU);
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
let atlas;
function hash(x,y){let n=Math.imul(x,374761393)+Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function makeAtlas(){
 const data=new Float32Array(W*H);
 // Tileable multiscale cloud density: computed once, not per animation frame.
 for(let octave=0;octave<6;octave++){
  const nx=8<<octave,ny=4<<octave,amplitude=.51*Math.pow(.51,octave);
  for(let y=0;y<H;y++){
   const fy=y/H*ny,iy=Math.floor(fy),ty=smooth(fy-iy);
   for(let x=0;x<W;x++){
    const fx=x/W*nx,ix=Math.floor(fx),tx=smooth(fx-ix);
    const a=hash(ix,iy),b=hash((ix+1)%nx,iy),c=hash(ix,(iy+1)%ny),d=hash((ix+1)%nx,(iy+1)%ny);
    data[y*W+x]+=amplitude*((a+(b-a)*tx)*(1-ty)+(c+(d-c)*tx)*ty);
   }
  }
 }
 return data;
}
function noise(lon,lat){
 atlas??=makeAtlas();
 const x=(lon/TAU+.5)*W,y=(lat/Math.PI+.5)*H,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
 const a=(iy&(H-1))*W,b=((iy+1)&(H-1))*W,u=ix&(W-1),v=(ix+1)&(W-1);
 return (atlas[a+u]*(1-fx)+atlas[a+v]*fx)*(1-fy)+(atlas[b+u]*(1-fx)+atlas[b+v]*fx)*fy;
}

// Irregular alternating jets; radians per animation second, deliberately
// accelerated. Smooth interpolation avoids visible sliding-strip boundaries.
const jets=[[-90,0],[-65,-.009],[-53,.013],[-43,-.017],[-34,.025],[-25,-.019],[-17,.021],[-8,.037],[0,.025],[8,.042],[17,-.022],[25,.027],[34,-.018],[43,.019],[54,-.012],[66,.009],[90,0]];
export function jupiterJetSpeed(lat){
 const degrees=lat/DEG;
 for(let i=1;i<jets.length;i++)if(degrees<=jets[i][0]){
  const [a,u]=jets[i-1],[b,v]=jets[i],f=smooth((degrees-a)/(b-a));return u+(v-u)*f;
 }
 return 0;
}
const belts=[[17,6.3,.89],[-16,6.5,.81],[33,2.4,.54],[-34,2.5,.54],[45,3.8,.41],[-47,3.7,.40],[58,3.0,.24],[-59,3.5,.26]];

function cloudMaterial(lon,lat,config){
 const {primary,secondary,detail=1,turbulence=1,pattern='jets'}=config;
 const polar=Math.abs(lat)/(Math.PI/2),activity=smooth((1-polar)*3),strength=turbulence*activity;
 let x=lon,y=lat;
 // Stable white ovals drift with their local jet. Each has an independently
 // curled interior. Longitude placement and sizes vary between neighboring cells.
 let oval=0,ovalR=3;
 const rows=[[-39,10,.11,.031],[41,12,.08,.026],[-57,15,.067,.026],[59,14,.063,.025],[28,9,.09,.025]];
 for(let row=0;row<rows.length;row++){
  const [latitude,count,baseRx,baseRy]=rows[row],center=latitude*DEG;
  if(Math.abs(lat-center)>.095)continue;
  const sector=TAU/count,phase=lon+row*.731;
  const cell=Math.round(phase/sector),seed=((cell%count)+count)%count;
  if(hash(seed,row+93)<.28)continue;
  const rx=baseRx*(.65+hash(seed,row+17)*.65),ry=baseRy*(.75+hash(seed,row+32)*.5);
  const cx=cell*sector+(hash(seed,row+21)-.5)*sector*.5,cy=center+(hash(seed,row+42)-.5)*.026;
  const dx=wrap(phase-cx)/rx,dy=(lat-cy)/ry,r2=dx*dx+dy*dy;
  if(r2<10){
   const weight=Math.exp(-r2*.48),angle=strength*(3.0+.7*Math.sin(seed))*(row%2?1:-1)*weight;
   const c=Math.cos(angle),s=Math.sin(angle);
   x+=(dx*c-dy*s-dx)*rx;y+=(dx*s+dy*c-dy)*ry;
   if(r2<ovalR*ovalR){ovalR=Math.sqrt(r2);oval=smooth((1.22-ovalR)*3)*(.65+.35*hash(seed,row));}
  }
 }
 // Repeated domain warping folds the cloud field at several scales. Latitude
 // compression stretches material into filaments along the moving jets.
 const stretch=pattern==='cells'?1.8:pattern==='filaments'?4.7:3.2;
 const broad=noise(x,y*1.4),fold=noise(x+(broad-.5)*.95*strength,y*stretch+(broad-.5)*.28*strength);
 const curl=noise(x+(fold-.5)*1.25*strength,y*stretch+(broad-.5)*.72*strength);
 const fine=noise(x*4+(curl-.5)*.6*strength,y*stretch*3+(fold-.5)*1.4*strength);
 const grain=noise(x*11+(fine-.5)*.35,y*19+(curl-.5)*.7);
 const cloudLatitude=(y+(curl-.5)*.18*strength+(fine-.5)*.067*strength)/DEG;
 let belt=0;
 for(const [center,width,weight] of belts){
  const d=(cloudLatitude-center)/width;
  if(Math.abs(d)<4)belt+=weight*Math.exp(-d*d);
 }
 const cap=smooth((Math.abs(cloudLatitude)-49)/29),equator=Math.exp(-cloudLatitude*cloudLatitude/32);
 const density=(curl-.5)*.46+(fine-.5)*.43+(grain-.5)*.19;
 const tint=clamp(belt+cap*.40+equator*.12+density*1.3*detail,.015,.95);
 const brightness=1+detail*((fine-.5)*.38+(grain-.5)*.24);
 const cool=smooth((.30-belt)*3)*activity*(.22+(broad-.5)*.25);
 let color=primary.map((value,k)=>(value*(1-tint)+secondary[k]*tint)*brightness+[-18,-5,7][k]*cool);
 if(oval>0){
  const interior=noise(x*5+2,y*13),opacity=oval*activity*.72;
  color=color.map((value,k)=>value*(1-opacity)+(primary[k]+(interior-.5)*32)*opacity);
 }
 // Longitude vanishes at a pole; blend to a single value at that point.
 const tip=smooth((polar-.975)/.025);
 return color.map((v,k)=>v*(1-tip)+(primary[k]*.61+secondary[k]*.31)*tip);
}

let materialKey='',material=null;
export function prepareJupiterCloudTop(config){
 const key=[...config.primary,...config.secondary,config.detail,config.turbulence,config.pattern].join(',');
 if(key!==materialKey){
  const data=new Uint8ClampedArray(W*H*3);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const color=cloudMaterial((x/W-.5)*TAU,(.5-y/(H-1))*Math.PI,config),i=(y*W+x)*3;
   data[i]=color[0];data[i+1]=color[1];data[i+2]=color[2];
  }
  material=data;materialKey=key;
 }
 return {...config,cloudMaterial:material};
}
function sampleMaterial(data,lon,lat){
 const x=(lon/TAU+.5)*W,y=clamp(.5-lat/Math.PI)*(H-1),ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
 const u=ix&(W-1),v=(ix+1)&(W-1),a=iy*W,b=Math.min(iy+1,H-1)*W;
 const color=[];
 for(let k=0;k<3;k++)color[k]=(data[(a+u)*3+k]*(1-fx)+data[(a+v)*3+k]*fx)*(1-fy)+(data[(b+u)*3+k]*(1-fx)+data[(b+v)*3+k]*fx)*fy;
 return color;
}

export function jupiterCloudTopSample(lon,lat,time,config){
 const prepared=config.cloudMaterial?config:prepareJupiterCloudTop(config);
 const {cloudMaterial:data,primary,flow=1,storm=1,turbulence=1}=prepared,t=time*flow;
 // Two overlapping advection phases refresh the clouds before shear can
 // stretch a storm into a thin line. Each phase is invisible at its wrap.
 const phase=((t+8)%16+16)%16-8,other=((t+16)%16+16)%16-8;
 const blend=.5+.5*Math.cos(phase*Math.PI/8),speed=jupiterJetSpeed(lat);
 let x=lon-phase*speed,otherX=lon-other*speed,y=lat;
 // Advect a high-resolution material instead of rebuilding its fractal for
 // every view on every frame. The same longitude wraps in the map and globe.
 const sx=wrap(lon-.38-t*.0035)/.33,sy=(lat+22*DEG)/.112,r2=sx*sx+sy*sy;
 let radius=4,rx=0,ry=0;
 if(r2<8&&storm>0){
  radius=Math.sqrt(r2);
  const angle=(2.6+.22*Math.sin(t*.13))/(1+r2)*smooth((2.7-radius)/1.1)*Math.min(storm,1.5);
  const c=Math.cos(angle),s=Math.sin(angle);
  rx=sx*c-sy*s;ry=sx*s+sy*c;x+=(rx-sx)*.33;otherX+=(rx-sx)*.33;y+=(ry-sy)*.112;
 }
 let color=sampleMaterial(data,x,y);
 if(blend<.99999){
  const next=sampleMaterial(data,otherX,y);
  color=color.map((value,k)=>value*blend+next[k]*(1-blend));
 }
 if(radius<1.5&&storm>0){
  const turn=t*.26+.6*radius,c=Math.cos(turn),s=Math.sin(turn),u=rx*c-ry*s,v=rx*s+ry*c;
  const cloud=noise(u*.42+1.7,v*.55+.3),strands=noise(u*1.1+(cloud-.5)*.5,v*1.7);
  radius+=(cloud-.5)*.11*turbulence;
  const edge=smooth((1.12-radius)*8)*Math.min(1,storm),rim=Math.exp(-Math.pow((radius-1.10)/.105,2))*Math.min(1,storm);
  const shade=.86+(cloud-.5)*.42+(strands-.5)*.25,red=[205,133,83];
  color=color.map((value,k)=>(value*(1-rim*.75)+primary[k]*rim*.75)*(1-edge)+red[k]*shade*edge);
 }
 return color;
}
