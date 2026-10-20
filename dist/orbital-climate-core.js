import {ORBITAL_OPEN_DIAMETER_KM,ORBITAL_WIDTH_KM,ORBITAL_DAY_PERIOD} from './orbital-scale.js';
export const W=128,H=32;
export const defaults={flux:1361,emissivity:.64,ocean:.65,mixing:1,seed:1610};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Approximate specific humidity at saturation, kg/kg, for an Earthlike column.
const saturation=t=>.0107*Math.exp(clamp(.065*(t-288),-8,4));
const TAU=2*Math.PI,SIGMA=5.670374419e-8;
export function createClimate(options={}){
 const p={...defaults,...options},n=W*H,T=new Float64Array(n).fill(288),next=new Float64Array(n),water=new Uint8Array(n),light=new Float32Array(n),moisture=new Float64Array(n),nextMoisture=new Float64Array(n),cloud=new Float32Array(n);
 // Synthetic, periodic land/ocean fractions; these are not the game's terrain plates.
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const a=TAU*x/W,b=y/H*TAU,s=p.seed*.013;
  const v=.5+.23*Math.sin(7*a+s+1.4*Math.sin(b))+.17*Math.cos(13*a-2*b+s)+.1*Math.sin(3*a+5*b);
  const i=y*W+x;water[i]=v<p.ocean?1:0;
  // Moist initial atmosphere; local ocean evaporation maintains it during the run.
  moisture[i]=saturation(288)*(water[i]?.85:.55);
  cloud[i]=1-Math.exp(-Math.max(0,moisture[i]-saturation(280))/.002);
 }
 return {p,T,next,water,light,moisture,nextMoisture,cloud,time:0,day:ORBITAL_DAY_PERIOD,diameter:ORBITAL_OPEN_DIAMETER_KM,width:ORBITAL_WIDTH_KM};
}
export function advance(s,steps=1){
 // Finite-volume heat exchange: periodic circumference, insulated band edges.
 // Conductance is shared by both cells, conserving energy across mixed capacities.
 const dt=1800,dx=Math.PI*s.diameter*1000/W,dy=s.width*1000/H;
 const k=8e6*1e6*s.p.mixing,cx=k/(dx*dx),cy=k/(dy*dy);
 for(let step=0;step<steps;step++){
  const phase=TAU*s.time/s.day;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const i=y*W+x,t=s.T[i],ice=Math.max(0,Math.min(1,(273.15-t)/10));
   const albedo=(s.water[i]?.24:.30)*(1-ice)+.60*ice;
   // Prescribed external-star illumination; a rotating, half-lit inner deck.
   const light=Math.max(0,Math.cos(TAU*(x+.5)/W-phase));s.light[i]=light*s.p.flux;
   const q=s.moisture[i],qs=saturation(t-8);
   const liquid=Math.max(0,q-qs),coverage=1-Math.exp(-liquid/.002);
   s.cloud[i]=coverage;
   const west=y*W+(x+W-1)%W,east=y*W+(x+1)%W;
   const moistureMix=1e6*s.p.mixing*((s.moisture[west]+s.moisture[east]-2*q)/(dx*dx)+((y?s.moisture[i-W]:q)+(y<H-1?s.moisture[i+W]:q)-2*q)/(dy*dy));
   const evaporation=s.water[i]?(1-ice)*Math.max(0,saturation(t)-q)/43200:0;
   const rainout=liquid/14400;
   s.nextMoisture[i]=Math.max(0,q+dt*(evaporation-rainout+moistureMix));
   // Cloud reflection feeds back on temperature; latent heating is not resolved.
   const heat=s.light[i]*(1-.35*coverage)*(1-albedo)-s.p.emissivity*SIGMA*t**4;
   const exchange=cx*(s.T[y*W+(x+W-1)%W]+s.T[y*W+(x+1)%W]-2*t)+cy*((y?s.T[i-W]:t)+(y<H-1?s.T[i+W]:t)-2*t);
   const capacity=s.water[i]?4.1e7:8e6; // 10 m mixed ocean; land + atmospheric column
   s.next[i]=t+dt*(heat+exchange)/capacity;
   if(!Number.isFinite(s.next[i])||s.next[i]<50||s.next[i]>700)throw Error('Climate left the supported temperature range. Reset with milder settings.');
  }
  [s.T,s.next]=[s.next,s.T];[s.moisture,s.nextMoisture]=[s.nextMoisture,s.moisture];s.time+=dt;
 }
 return s;
}
export function summarize(s){let sum=0,min=Infinity,max=-Infinity,ice=0;for(const t of s.T){sum+=t;min=Math.min(min,t);max=Math.max(max,t);if(t<273.15)ice++;}return {mean:sum/s.T.length-273.15,min:min-273.15,max:max-273.15,ice:ice/s.T.length};}
