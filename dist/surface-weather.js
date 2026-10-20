// Diagnostic steady weather patterns. Coefficients are authored, not GCM fits.
// Fields follow the ExoPlaSim display layout, without claiming its provenance.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function estimateWeather(planet,atmosphere,c,a,g){
 if(planet==='ice')return null;
 const {cells:n,longitude:w,latitude:h}=g,R=6371000*c.radius;
 const gasR=atmosphere.startsWith('co2')?189:atmosphere.startsWith('water')?461:atmosphere.startsWith('methane')?519:planet==='silicate'?190:297;
 const omega=2*Math.PI/(c.rotation*86400),drag=c.drag/86400;
 const lat=Array.from(a.slice(7*n,7*n+h),Math.asin),dLon=2*Math.PI/w;
 const potential=new Float64Array(n),convergence=new Float64Array(n);
 let maxWind=0;
 for(let i=0;i<n;i++){
  // Warm columns drive near-ground convergence; rock vapor instead flows out
  // from its evaporative high-pressure source toward a condensation sink.
  potential[i]=planet==='silicate'?-gasR*a[6*n+i]*Math.log(Math.max(1e-8,a[4*n+i])):gasR*0.12*a[6*n+i];
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,west=y*w+(x+w-1)%w,east=y*w+(x+1)%w,yn=Math.max(0,y-1),ys=Math.min(h-1,y+1);
  const ax=(potential[east]-potential[west])/(2*R*Math.cos(lat[y])*dLon);
  const ay=(potential[yn*w+x]-potential[ys*w+x])/(R*(lat[yn]-lat[ys]));
  const f=2*omega*Math.sin(lat[y]),den=drag*drag+f*f;
  let u=(drag*ax+f*ay)/den,v=(drag*ay-f*ax)/den;
  const speed=Math.hypot(u,v),sound=Math.sqrt(1.3*gasR*a[6*n+i]);
  // Soft inertial/sound-speed bound avoids equatorial geostrophic singularities.
  const cap=Math.min(planet==='silicate'?500:120,0.3*sound),scale=cap/Math.sqrt(cap*cap+speed*speed);
  const gasPresent=planet==='silicate'?a[4*n+i]/(a[4*n+i]+0.01):1;
  u*=scale*gasPresent;v*=scale*gasPresent;
  a[2*n+i]=u;a[3*n+i]=v;maxWind=Math.max(maxWind,Math.hypot(u,v));
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,yn=Math.max(0,y-1),ys=Math.min(h-1,y+1);
  const du=(a[2*n+y*w+(x+1)%w]-a[2*n+y*w+(x+w-1)%w])/(2*dLon);
  const dv=(a[3*n+yn*w+x]*Math.cos(lat[yn])-a[3*n+ys*w+x]*Math.cos(lat[ys]))/(lat[yn]-lat[ys]);
  convergence[i]=clamp(-(du+dv)/(R*Math.cos(lat[y]))*86400,0,1);
 }
 const species=planet==='venus'?'sulfuric-acid cloud potential (assumed trace water/sulfur)':planet==='volatile'?'methane cloud potential (assumed methane supply)':planet==='silicate'?'mineral condensate potential':'water / ice cloud potential';
 let meanCloud=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,T=a[6*n+i],mu=Math.cos(lat[y])*Math.cos(x*dLon-c.substellar*Math.PI/180);
  const lift=convergence[i],day=Math.max(0,mu);
  // Column-cloud templates: never interpret the hot surface as cloud altitude.
  let potential;
  if(planet==='venus')potential=0.85+0.12*lift;
  else if(planet==='steam')potential=0.25+0.5*lift+0.15*(1-day);
  else if(planet==='volatile')potential=0.08+0.5*lift+0.2*(1-day);
  else if(planet==='silicate')potential=Math.exp(-(((T-1550)/400)**2))*Math.min(1,a[4*n+i]/0.03);
  else {
   const waterWindow=clamp((T-170)/90,0,1)*clamp((650-T)/250,0,1);
   potential=waterWindow*(0.08+0.68*lift+0.38*day**2);
  }
  // Planet-fixed organization is deterministic; no frame-by-frame random clouds.
  const structure=0.9+0.1*Math.sin(3*x*dLon+2*Math.sin(lat[y]))*Math.cos(5*lat[y]);
  const column=planet==='silicate'?1:clamp(Math.sqrt(c.pressure/c.gravity),0.05,1.2);
  const cloud=clamp(c.moisture*potential*structure*column,0,1);
  a[n+i]=cloud;meanCloud+=cloud/n;
 }
 return {method:'thermal-gradient / drag–Coriolis diagnostic v1',species,max_wind_m_s:maxWind,mean_cloud_fraction:meanCloud,
  radius_m:R,gravity_m_s2:9.80665*c.gravity,column_mass_kg_m2:c.pressure*100000/(9.80665*c.gravity),
  substellar_longitude_degrees:c.substellar,locked:Boolean(c.tidalLock),
  assumptions:['Rotation period controls Coriolis deflection. In locked mode it equals the assumed orbital period; stellar mass and orbit are not solved.',
   'Thermal convergence uses a prescribed column-pressure potential, not gradients of the uniform surface-pressure map. Drag and speed bounds are authored.',
   'Cloud supply is an adjustable proxy, not relative humidity. Species and cloud deck temperatures are assumed; no saturation, chemistry, precipitation or upper-level wind is solved.',
   'Cloud traces use surface wind as a visualization proxy; they are not predicted cloud trajectories. Permanent cloud patterns do not evolve with animation.']};
}
