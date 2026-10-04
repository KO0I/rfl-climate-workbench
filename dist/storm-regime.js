// Laboratory regime relation for polygonal shear-layer vortices.
// Onset fit Ro = 27 * E^0.72 from rotating-tank experiments; observed
// wavenumbers span m = 2-8. Band boundaries are digitized approximations
// of the published regime diagram, and E < 1e-5 is extrapolation, not
// measurement (m up to 10 there assumes the m ~ E^(-1/4) layer-thinning
// scaling persists). Appearance model only: not a fluid solution.

export function classifyPolarStorm(Ro,E){
 const extrapolated=E<1e-5;
 const onset=27*Math.pow(E,0.72);
 if(Ro<onset)return {regime:'stable',m:0,extrapolated};
 const Echaos=1e-5*Math.pow(Ro/0.18,1.4);
 if(Ro>0.18&&E<Echaos)return {regime:'chaotic',m:0,extrapolated};
 const b1=65*Math.pow(E,0.72),b2=130*Math.pow(E,0.72),b3=260*Math.pow(E,0.72);
 let m;
 if(Ro<b1){
  const mmax=E>=1e-5?8:Math.min(10,Math.round(8*Math.pow(1e-5/E,0.25)));
  m=mmax-Math.round((mmax-6)*Math.min(1,Math.max(0,(Ro-onset)/(b1-onset))));
 }else if(Ro<b2){
  m=5-Math.round(Math.min(1,Math.max(0,(Ro-b1)/(b2-b1))));
 }else m=Ro<b3?3:2;
 return {regime:'polygon',m,extrapolated};
}

// f = 2 * Omega at the pole; L = jet radius in metres (jetRadiusDeg of
// colatitude). Eddy viscosity is a free parameter to order of magnitude;
// no measured value exists for any giant planet.
export function regimeFromWorld({rotationHours,planetRadius,jetSpeed,jetRadiusDeg,eddyViscosity}){
 const f=4*Math.PI/(rotationHours*3600);
 const L=planetRadius*jetRadiusDeg*Math.PI/180;
 return {Ro:jetSpeed/(f*L),E:eddyViscosity/(f*L*L)};
}
