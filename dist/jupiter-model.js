import {clamp,rgb} from './saturn-layers.js';
import {jupiterCloudTopSample,prepareJupiterCloudTop} from './jupiter-clouds.js';
const TAU=2*Math.PI,DEG=Math.PI/180;
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));

// A kinematic cloud illustration; no claim to solve Jupiter's fluid dynamics.
export function jupiterLayerSample(lon,lat,time,index,config){
 const {detail=1,turbulence=1,flow=1,pattern='jets',wave=1,storm=1}=config;
 let color;
 if(index===0)color=jupiterCloudTopSample(lon,lat,time,config);
 else{
 const cos=Math.cos(lat),t=time*flow,adv=lon-t*(.12*Math.cos(lat*10)+.09*cos*cos);
 const warp=turbulence*.055*Math.sin(adv*8+2*Math.sin(lat*18))*cos;
 let texture;
 if(pattern==='cells')texture=Math.sin(adv*21+2.8*Math.sin(lat*26+t*.08))*Math.sin(lat*35+2*Math.cos(adv*13));
 else if(pattern==='filaments')texture=Math.sin(adv*35+Math.sin(lat*53+warp*18)*3)+.4*Math.sin(adv*61-lat*67);
 else texture=Math.sin(adv*17+2.4*Math.sin(lat*33+warp*11))+.5*Math.sin(adv*31-lat*47);
 const bands=Math.sin((lat+warp)*23+.25*Math.sin(adv*5)*cos)+.27*Math.sin(lat*51+warp*9);
 const tint=clamp(.40-.39*bands,0,.9),brightness=.91+detail*.075*texture*cos;
 color=config.primary.map((c,k)=>(c*(1-tint)+config.secondary[k]*tint)*brightness);
 // A continuously wrapped, swirling oval near 22 degrees south.
 const sx=wrap(lon-.38-time*.026)/.34,sy=(lat+22*DEG)/.12,r=Math.hypot(sx,sy);
 const mask=clamp((1.15-r)*6)*storm;
 if(mask>0){
  const swirl=.78+.12*Math.sin(r*19-Math.atan2(sy,sx)*2+t*.6)+.10*Math.cos(r*37+t*.3);
  const red=[225,104,57],rim=Math.exp(-Math.pow((r-.95)/.12,2));
  color=color.map((c,k)=>c*(1-mask)+(red[k]*swirl+rim*32)*mask);
 }
 }
 // Northern eight-around-one and southern five-around-one cyclone clusters.
 // This is an appearance motif; continuation into deeper decks is speculative.
 const polarRadius=Math.PI/2-Math.abs(lat);
 if(polarRadius<.47&&index<4){
  const t=time*flow,count=lat>=0?8:5,sector=TAU/count,phase=lon-t*.018;
  const local=((phase+sector/2)%sector+sector)%sector-sector/2;
  const dx=polarRadius*Math.cos(local)-.23,dy=polarRadius*Math.sin(local);
  const central=polarRadius/.071,outer=Math.hypot(dx,dy)/(lat>=0?.057:.072);
  const isCenter=central<outer,d=isCenter?central:outer;
  const angle=isCenter?lon:Math.atan2(dy,dx),envelope=Math.exp(-d*d*.72)*wave;
  const swirl=.5+.5*Math.sin(d*12-angle*2+t*.45);
  color=color.map((c,k)=>c*(1-envelope*.62)+config.primary[k]*envelope*(.15+.4*swirl));
 }
 if(config.palette==='thermal')color=color.map((c,k)=>c*[1.12,.75,.51][k]);
 return color;
}

export function paintJupiterLayer(image,coordinates,time,index,config){
 let prepared={...config,primary:rgb(config.color),secondary:rgb(config.accent)};
 if(index===0)prepared=prepareJupiterCloudTop(prepared);
 for(let i=0,j=0;i<image.data.length;i+=4,j+=2){
  const c=Number.isNaN(coordinates[j+1])?[7,13,23]:jupiterLayerSample(coordinates[j],coordinates[j+1],time,index,prepared);
  image.data[i]=c[0];image.data[i+1]=c[1];image.data[i+2]=c[2];image.data[i+3]=255;
 }
 return image;
}
