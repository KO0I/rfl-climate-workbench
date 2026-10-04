// Kinematic appearance model. These paths are prescribed, not a fluid solution.
const TAU=2*Math.PI, DEG=Math.PI/180;
export const saturnDefaults={wave:1,detail:1,speed:1};
// sides: azimuthal wavenumber of the polar jet meander. Unset keeps the
// prescribed defaults (6 north, 10 south); sides < 3 renders the axisymmetric
// (stable) limit, a circle. Regime-derived values come from storm-regime.js.
export function polarBoundary(lon,north,time,wave=1,sides){
 const m=sides??(north?6:10);
 const radius=north?12:28;
 if(!(m>=3))return radius;
 const phase=north?0:time*.012;
 const sector=TAU/m,a=((lon-phase+sector/2)%sector+sector)%sector-sector/2;
 const polygon=radius*Math.cos(Math.PI/m)/Math.cos(a);
 const strength=wave*(north?1:.86+.14*Math.sin(time*.09));
 return radius+strength*(polygon-radius);
}
export function cloudSample(lon,lat,time,{wave=1,detail=1,sidesNorth,sidesSouth}={}){
 const north=lat>=0,abs=Math.abs(lat),polarDistance=90-abs/DEG;
 const boundary=polarBoundary(lon,north,time,wave,north?sidesNorth:sidesSouth),d=polarDistance-boundary;
 const envelope=Math.exp(-d*d/18),cosLat=Math.cos(lat);
 // Differential east/west flow with periodic longitude harmonics; no map seam.
 const flow=.16*Math.cos(lat*12)+.10*cosLat*cosLat;
 const adv=lon-time*flow;
 const texture=(Math.sin(adv*15+Math.sin(lat*41)*2)+.5*Math.sin(adv*31-lat*63+time*.12))*cosLat;
 const bands=Math.sin(lat*34+.35*Math.sin(adv*6)*cosLat)+.35*Math.sin(lat*79);
 let brightness=.64+.09*bands+.027*detail*texture;
 // A dark cap bordered by a pale jet; fine cloud streaks travel along the jet.
 const cap=1/(1+Math.exp(Math.max(-40,Math.min(40,d*2))));
 const jet=Math.exp(-d*d/.20);
 brightness-=cap*.17;
 brightness+=.15*jet+.025*detail*envelope*Math.sin(adv*42+d*8);
 const eye=Math.exp(-polarDistance*polarDistance/2.4);
 brightness-=.28*eye;
 // Haze and palette are illustrative, not calibrated spectral radiance.
 const cool=(north?.85:.35)*cap;
 const value=Math.max(.12,Math.min(.96,brightness));
 return [255*value-40*cool,222*value-8*cool,162*value+30*cool];
}

// The polar maps sample the same field directly, avoiding loss of the small
// northern hexagon when magnifying the equirectangular display texture.
export function createCoordinates(width,height,pole=null,polarExtent=null){
 const coordinates=new Float64Array(width*height*2);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*2;
  if(!pole){coordinates[i]=((x+.5)/width-.5)*TAU;coordinates[i+1]=(0.5-(y+.5)/height)*Math.PI;}
  else{
   const nx=(x+.5-width/2)/(width*.47),ny=(height/2-y-.5)/(height*.47),r=Math.hypot(nx,ny);
   coordinates[i]=Math.atan2(nx,pole==='north'?-ny:ny);
   coordinates[i+1]=r>1?NaN:(pole==='north'?1:-1)*(Math.PI/2-r*(polarExtent??(pole==='north'?25:50))*DEG);
  }
 }
 return coordinates;
}
export function paintClouds(image,coordinates,time,config){
 for(let i=0,j=0;i<image.data.length;i+=4,j+=2){
  const rgb=Number.isNaN(coordinates[j+1])?[10,18,33]:cloudSample(coordinates[j],coordinates[j+1],time,config);
  image.data[i]=rgb[0];image.data[i+1]=rgb[1];image.data[i+2]=rgb[2];image.data[i+3]=255;
 }
 return image;
}

// Every cloud deck keeps the same polar boundaries: the prescribed six/ten
// sides by default, or the wavenumber derived from the Ro/E regime relation
// when the regime controls are engaged. Only the small eddies and band
// structure are warped; depth continuation is speculative.
export function layerSample(lon,lat,time,index,config){
 const {wave=1,detail=1,turbulence=1,flow=1,pattern='jets',palette='color',sidesNorth,sidesSouth}=config;
 const cos=Math.cos(lat),t=time*flow,adv=lon-t*(.14*Math.cos(lat*12)+.1*cos*cos);
 const warp=turbulence*.045*Math.sin(adv*9+2*Math.sin(lat*19))*cos;
 let texture;
 if(pattern==='cells')texture=Math.sin(adv*24+2.8*Math.sin(lat*23+t*.08))*Math.sin(lat*39+2*Math.cos(adv*12));
 else if(pattern==='filaments')texture=Math.sin(adv*36+Math.sin(lat*57+warp*20)*3)+.4*Math.sin(adv*63-lat*73);
 else texture=Math.sin(adv*18+Math.sin(lat*37+warp*10)*2)+.5*Math.sin(adv*33-lat*49);
 const band=Math.sin((lat+warp)*34)+.35*Math.sin(lat*79+warp*7);
 const d=90-Math.abs(lat)/DEG-polarBoundary(lon,lat>=0,time,wave,lat>=0?sidesNorth:sidesSouth);
 const cap=1/(1+Math.exp(Math.max(-40,Math.min(40,d*2))));
 const jet=Math.exp(-d*d/.26),eye=Math.exp(-Math.pow((90-Math.abs(lat)/DEG)/1.6,2));
 const value=Math.max(.03,Math.min(1,.63+.10*band+detail*.055*texture*cos-cap*.17+.28*jet-.30*eye));
 const primary=config.primary,secondary=config.secondary;
 if(palette==='infrared'){
  // Visual analogy to Cassini PIA13405, not synthesized spectral radiance.
  const storm=Math.max(0,texture*.45+.2*Math.sin(lat*94+adv*15));
  const thermal=Math.max(.015,(.58+.22*band+.1*texture)*(1-storm*.83));
  const haze=(.5+.5*Math.tanh((Math.sin(lon+.65)*cos+.15)*9))*.7;
  return primary.map((c,k)=>c*thermal*(1-haze)+secondary[k]*haze*(.48+.17*band)+jet*90-eye*35);
 }
 const tint=Math.max(0,Math.min(.7,.30-.2*band+cap*.45));
 return primary.map((c,k)=>(c*(1-tint)+secondary[k]*tint)*value*1.24+jet*22);
}

export function paintLayer(image,coordinates,time,index,config){
 const color=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 const prepared={...config,primary:color(config.color),secondary:color(config.accent)};
 for(let i=0,j=0;i<image.data.length;i+=4,j+=2){
  const c=Number.isNaN(coordinates[j+1])?[7,13,23]:layerSample(coordinates[j],coordinates[j+1],time,index,prepared);
  image.data[i]=c[0];image.data[i+1]=c[1];image.data[i+2]=c[2];image.data[i+3]=255;
 }
 return image;
}
