// Shared, body-local spherical wind field for the globe and RFL export.
// Velocities are unit-sphere displacement per animation second, not m/s.
const D2R=Math.PI/180,GY0=13,GDEL=3.3,GSIG=4.3,GMAX=40,GSPEED=1.6;
const KHW=4,KHK=12,KHB=180/7.3,KHA=.009;
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
export function preparePolarFlow(state){
 const {Ro,E,time,phaseN,phaseS}=state,info=state;
 const gstorms=state.storms.map(s=>{const la=s.lat*D2R,lo=s.lon*D2R;return {...s,cx:Math.cos(la)*Math.cos(lo),cy:Math.sin(la),cz:Math.cos(la)*Math.sin(lo)};});
 const bandSpeed=latDeg=>(6+8*Math.min(1,Ro))*Math.sin(7.3*latDeg*D2R)*Math.pow(Math.max(.02,Math.cos(latDeg*D2R)),.55);
  const m=info.regime==='polygon'?info.m:3;
  const GOs=.45+.55*Math.min(1,Ro); // same spin rate as the dye plate
  const GA0=.55*GOs*GY0*GSIG*GSIG/(4*GDEL);
  let gA=0;
  if(info.regime==='chaotic')gA=GA0*(.7+.45*Math.sin(1.7*time)+.25*Math.sin(3.1*time+1));
  else if(info.regime==='polygon'){const excess=Ro/(27*Math.pow(E,.72));gA=GA0*Math.min(1.5,Math.max(.35,.4+.3*(excess-1)));}
  const khAmp=KHA*(.5+.5*Math.min(1,Ro));
  const khEnv=[],khPh=[];
  for(let b=-2;b<=2;b++){khEnv.push(Math.pow(Math.max(0,Math.sin(.21*time+b*2.13)),1.6));khPh.push((b%2?1:-1)*.06*time+b*1.7);}
 return function sample(p){
   const lat=Math.asin(clamp(p.y,-1,1)),latDeg=lat/D2R,lon=Math.atan2(p.z,p.x);
   const sLat=Math.sin(lat),cLat=Math.cos(lat);
   const eEx=-Math.sin(lon),eEz=Math.cos(lon);
   const eNx=-sLat*Math.cos(lon),eNy=cLat,eNz=-sLat*Math.sin(lon);
   const ub=bandSpeed(latDeg);
   let vx=ub*eEx,vy=0,vz=ub*eEz;
   let uKh=0,vKh=0;
   for(let b=-2;b<=2;b++){
    const d=latDeg-b*KHB;
    if(d<-3*KHW||d>3*KHW||khEnv[b+2]<.01)continue;
    const eb=Math.exp(-(d/KHW)*(d/KHW)),aw=KHK*(lon-khPh[b+2]),amp=khAmp*khEnv[b+2];
    uKh+=amp*(2*d/(KHW*KHW*D2R))*eb*Math.cos(aw)/D2R;
    vKh+=-amp*KHK*eb*Math.sin(aw)/Math.max(cLat,.35)/D2R;
   }
   vx+=uKh*eEx+vKh*eNx;vy+=vKh*eNy;vz+=uKh*eEz+vKh*eNz;
   for(let pole=0;pole<2;pole++){
    const gDeg=pole?90+latDeg:90-latDeg;
    if(gDeg>=GMAX)continue;
    const r=Math.max(gDeg,1.3),x2=(r-GY0)/GSIG,g=Math.exp(-x2*x2);
    const a=m*((pole?-1:1)*lon-(pole?phaseS:phaseN));
    const vr=-gA*g*m*Math.sin(a)/r;
    const vt=r*GOs*(-Math.tanh((r-GY0)/GDEL))+gA*g*2*(r-GY0)/(GSIG*GSIG)*Math.cos(a);
    const os=pole?1:-1,as=pole?-1:1; // south: outward is northward, spin mirrored
    vx+=vr*os*eNx+vt*as*eEx;vy+=vr*os*eNy;vz+=vr*os*eNz+vt*as*eEz;
   }
   for(const s of gstorms){
    const dot=clamp(p.x*s.cx+p.y*s.cy+p.z*s.cz,-1,1);
    const d=Math.acos(dot)/D2R;
    if(d>=4*s.sigma)continue;
    let tx=s.cy*p.z-s.cz*p.y,ty=s.cz*p.x-s.cx*p.z,tz=s.cx*p.y-s.cy*p.x;
    const tl=Math.hypot(tx,ty,tz)||1;tx/=tl;ty/=tl;tz/=tl;
    const fade=Math.sin(Math.PI*s.age/s.life);
    const w=s.gamma*(d/s.sigma)*Math.exp(-d*d/(2*s.sigma*s.sigma))*fade;
    vx+=w*tx;vy+=w*ty;vz+=w*tz;
   }
   const fade=Math.min(1,Math.hypot(p.x,p.z)/Math.sin(1.3*D2R));
   return [vx,vy,vz].map(v=>v*GSPEED*D2R*fade);
 };
}
