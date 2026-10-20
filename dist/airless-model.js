// Deterministic artistic terrain, not an impact or atmospheric simulation.
// All evaluation is in unit-sphere coordinates, including exported cube faces.
export const airlessDefaults = Object.freeze({seed:2448, resolution:256, radius:1737.4, density:360, size:14, depth:1, rim:1, warp:.055, age:.35, roughness:.45});
export const airlessPresets = {
 lunar:{...airlessDefaults},
 battered:{...airlessDefaults,seed:2447,density:700,size:18,age:.55,roughness:.7},
 fresh:{...airlessDefaults,seed:1729,density:180,size:11,age:.08,roughness:.25},
 worn:{...airlessDefaults,seed:8128,density:420,size:20,age:.85,depth:.6,rim:.55,roughness:.3}
};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
export function validateAirless(input){
 const s={...airlessDefaults,...input};
 const bounds={seed:[0,4294967295],radius:[10,15000],density:[0,800],size:[4,24],depth:[.2,1.8],rim:[0,2],warp:[0,.15],age:[0,1],roughness:[0,1]};
 for(const [key,[lo,hi]] of Object.entries(bounds))if(!Number.isFinite(s[key])||s[key]<lo||s[key]>hi)throw new Error('Invalid airless '+key+'.');
 if(!Number.isInteger(s.seed)||!Number.isInteger(s.density)||![128,256,512].includes(s.resolution))throw new Error('Invalid seed, count, or resolution.');
 return s;
}
export function createAirlessModel(input){
 const settings=validateAirless(input),r=rng(settings.seed),phase=Array.from({length:6},()=>r()*20);
 const wave=(x,y,z,f)=> (Math.sin(x*f+phase[0]+Math.sin(z*f*.7+phase[1]))+Math.sin(y*f*1.17+phase[2]+Math.sin(x*f*.83+phase[3]))+Math.sin(z*f*.93+phase[4]+Math.sin(y*f*.71+phase[5])))/3;
 const base=(x,y,z)=>settings.roughness*(.0015*wave(x,y,z,8)+.0005*wave(x,y,z,27)+.00015*wave(x,y,z,83));
 const craters=[];
 for(let i=0;i<settings.density;i++){
  const cy=2*r()-1,lon=r()*Math.PI*2,rr=Math.sqrt(1-cy*cy),cx=rr*Math.sin(lon),cz=rr*Math.cos(lon);
  const radius=(.65+(settings.size-.65)*Math.pow(r(),3))*Math.PI/180;
  const tx=Math.cos(lon),tz=-Math.sin(lon),bx=cy*tz,by=cz*tx-cx*tz,bz=-cy*tx;
  const age=r(),wear=settings.age*(.4+.6*age),depth=radius*.14*settings.depth*Math.pow(Math.min(1,.04/radius),.4)*(1-.65*wear);
  const c={id:i,cx,cy,cz,tx,tz,bx,by,bz,radius,age,wear,depth,rim:radius*.027*settings.rim*(1-.8*wear),phase:r()*6.283,reference:base(cx,cy,cz)};
  c.scale=2*(1-Math.cos(radius));c.cutoff=Math.cos(radius*2);craters.push(c);
 }
 // Age 1 is oldest. Stable ID is the tie-breaker across tiles/resolutions.
 craters.sort((a,b)=>b.age-a.age||a.id-b.id);
 function sample(x,y,z){
  let h=base(x,y,z);
  for(const c of craters){
   const dot=x*c.cx+y*c.cy+z*c.cz;if(dot<c.cutoff)continue;
   const u=(x*c.tx+z*c.tz)/c.radius,v=(x*c.bx+y*c.by+z*c.bz)/c.radius;
   const distortion=1+settings.warp*(Math.sin(u*5+c.phase)+.5*Math.sin(v*9-c.phase));
   const q=2*Math.max(0,1-dot)/(c.scale*distortion*distortion);if(q>2.5)continue;
   const d=Math.sqrt(q),wall=smooth((d-.35)/.65),floor=-c.depth*(1-wall);
   if(d<1){
    const blend=1-smooth((d-.88)/.12);
    const detail=c.depth*.025*Math.sin(u*19+c.phase)*Math.sin(v*17-c.phase)*(1-c.wear);
    const peak=c.radius>.09?c.depth*.22*Math.max(0,1-q/.07)**2:0;
    h+=(c.reference+floor+detail+peak-h)*blend;
   }
   const rimWidth=.11+.15*c.wear,ring=Math.max(0,1-Math.abs(d-1)/rimWidth);
   const broken=clamp(.8+.22*Math.sin(u*11+v*8+c.phase),.4,1);
   h+=c.rim*ring*ring*broken;
   if(d>1)h+=c.rim*.24*(1-smooth((d-1)/.55))*(.65+.35*Math.sin(u*23-v*15));
  }
  return h*settings.radius*1000;
 }
 return {settings,craters,sample};
}
export function generateAirless(input){
 const model=createAirlessModel(input),width=model.settings.resolution*2,height=model.settings.resolution,heights=new Float32Array(width*height);
 let min=Infinity,max=-Infinity;
 for(let y=0;y<height;y++){
  const lat=Math.PI*(.5-(y+.5)/height),cy=Math.sin(lat),rr=Math.cos(lat);
  for(let x=0;x<width;x++){const lon=((x+.5)/width-.5)*2*Math.PI,h=model.sample(rr*Math.sin(lon),cy,rr*Math.cos(lon));heights[y*width+x]=h;min=Math.min(min,h);max=Math.max(max,h);}
 }
 return {settings:model.settings,width,height,heights,min,max,craterCount:model.craters.length};
}
