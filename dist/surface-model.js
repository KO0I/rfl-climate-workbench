// Illustrative steady surface energy balance, not ExoPlaSim or a circulation model.
// Priors and grey opacity coefficients are authored exploration settings, not
// measured exoplanet probabilities, spectral opacities, or phase-equilibrium data.
import './model-config.js';
export const surfaceProfiles = {
  ice: {atmospheres:['none'], flux:[2,180], pressure:[0,0], rotation:[1,80], albedo:[0.55,0.85], defaults:{flux:70,pressure:0,rotation:20,albedo:0.7}, description:'Airless ice · no greenhouse warming or atmospheric heat transport.'},
  volatile: {atmospheres:['nitrogen','methane','methanerich'], flux:[10,65], pressure:[0.005,2.5], rotation:[2,30], albedo:[0.2,0.5], defaults:{flux:15,pressure:1.5,rotation:16,albedo:0.3}, description:'Icy surface · cold volatile atmosphere. Gas retention is only screened approximately.'},
  venus: {atmospheres:['co2','co2rich'], flux:[1800,3500], pressure:[20,150], rotation:[20,250], albedo:[0.6,0.8], defaults:{flux:2613,pressure:92,rotation:117,albedo:0.75}, description:'Dense CO₂ · bright reflective envelope · strong prescribed greenhouse effect.'},
  steam: {atmospheres:['water','waterrich'], flux:[3000,6500], pressure:[5,100], rotation:[0.5,20], albedo:[0.25,0.55], defaults:{flux:6000,pressure:80,rotation:3,albedo:0.3}, description:'Hot steam above rock · no liquid-water ocean is assumed.'},
  silicate: {atmospheres:['silicate'], flux:[350000,1800000], pressure:[0,0.1], rotation:[0.2,2], albedo:[0.05,0.25], defaults:{flux:900000,pressure:0,rotation:0.7,albedo:0.12}, description:'Permanent hot dayside · thin local rock vapor · frozen nightside. Vapor pressure is an illustrative proxy.'}
};
export function canEstimate(planet,atmosphere) {
  return Boolean(surfaceProfiles[planet]?.atmospheres.includes(atmosphere));
}
export function surfaceBounds(planet,atmosphere) {
  const p=surfaceProfiles[planet];
  if(!canEstimate(planet,atmosphere)) throw new Error('This atmosphere has no surface estimate for the selected world.');
  if(planet==='volatile') return atmosphere==='nitrogen'
    ? {...p,flux:[12,25],pressure:[0.2,2.5]}
    : {...p,flux:[35,65],pressure:[0.005,0.08]};
  return p;
}
export function validateSurfaceConfig(planet,atmosphere,c) {
  const p=surfaceBounds(planet,atmosphere);
  if(!c||typeof c!=='object'||Object.keys(c).some(k=>!['flux','pressure','rotation','albedo'].includes(k)))throw new Error('Expected surface sunlight, pressure, rotation and albedo.');
  for(const key of ['flux','pressure','rotation','albedo']) {
    const [lo,hi]=p[key];
    if(!Number.isFinite(c[key])||c[key]<lo||c[key]>hi)throw new Error(`For this surface, ${key} must be ${lo}–${hi}.`);
  }
  if((planet==='ice'||planet==='silicate')&&c.pressure!==0)throw new Error('Airless pressure is zero; rock vapor pressure is derived from temperature.');
  return {...c};
}
export function defaultSurfaceConfig(planet,atmosphere) {
  const p=surfaceBounds(planet,atmosphere),c={...p.defaults};
  if(planet==='volatile'&&atmosphere!=='nitrogen')Object.assign(c,{flux:50,pressure:0.02});
  return validateSurfaceConfig(planet,atmosphere,c);
}
const SIGMA=5.670374419e-8;
export function surfaceParameters(planet,c) {
  let tau=0,redistribution=0;
  if(planet==='volatile'){tau=0.5*Math.sqrt(c.pressure);redistribution=0.65+0.25*c.pressure/(c.pressure+0.1);}
  // The Venus reference's grey factor is calibrated to about 735 K at 92 bar;
  // this does not validate it for other dense CO₂ atmospheres.
  if(planet==='venus'){tau=135*(c.pressure/92)**0.65;redistribution=0.96;}
  if(planet==='steam'){tau=3+0.75*c.pressure**0.65;redistribution=0.90;}
  // A fixed substellar point for lava worlds; rotation is their assumed locked
  // orbital period. Other worlds blend daily-average and local illumination.
  return {tau,redistribution,diurnalMix:planet==='silicate'?0:1/(1+c.rotation/5),internalFlux:planet==='silicate'?0.2:0.05};
}
// Clausius–Clapeyron screen around the normal boiling point; idealized constant
// latent heat. Used to reject clearly condensing random volatile atmospheres.
export function volatileSaturationBar(atmosphere,temperature) {
  const [boiling,latent]=atmosphere==='nitrogen'?[77.36,669]:[111.66,986];
  return Math.exp(latent*(1/boiling-1/temperature));
}
export function rockVaporBar(temperature) {
  return Math.min(0.1,0.001*Math.exp(60000*(1/2000-1/temperature)));
}
export function estimateSurface(planet,atmosphere,input,preset='low') {
  const c=validateSurfaceConfig(planet,atmosphere,input),params=surfaceParameters(planet,c),grid=ExoConfig.resolution(preset);
  const {cells:N,longitude:width,latitude:rows}=grid;
  const fields=new Float32Array(7*N+2*rows+4).fill(NaN),forcing=new Float64Array(N);
  let meanForcing=0;
  for(let y=0;y<rows;y++){
    const sinLat=1-(y+0.5)*2/rows,cosLat=Math.sqrt(1-sinLat*sinLat);
    fields[7*N+y]=sinLat;fields[7*N+rows+y]=2/rows;
    for(let x=0;x<width;x++){
      const local=cosLat*Math.max(0,Math.cos(x*2*Math.PI/width));
      const daily=cosLat/Math.PI;
      const q=(1-params.diurnalMix)*local+params.diurnalMix*daily;
      forcing[y*width+x]=q;meanForcing+=q/N;
    }
  }
  // Renormalize the discrete illumination to <S> = stellar flux / 4 exactly.
  let min=Infinity,max=-Infinity,mean=0,meanOutgoing=0;
  for(let i=0;i<N;i++){
    const illumination=(1-params.redistribution)*forcing[i]/(4*meanForcing)+params.redistribution/4;
    const absorbed=c.flux*(1-c.albedo)*illumination+params.internalFlux;
    const temperature=(absorbed*(1+0.75*params.tau)/SIGMA)**0.25;
    const pressure=planet==='silicate'?rockVaporBar(temperature):c.pressure;
    fields[6*N+i]=temperature;fields[4*N+i]=pressure*100000;fields[5*N+i]=1;
    min=Math.min(min,temperature);max=Math.max(max,temperature);mean+=temperature/N;
    meanOutgoing+=SIGMA*temperature**4/(1+0.75*params.tau)/N;
  }
  const meanInput=c.flux*(1-c.albedo)/4+params.internalFlux;
  return {model:'surface-estimate',fields,availableFields:['temperature','pressure'],config:c,parameters:params,
    statistics:{min,max,mean,mean_input_w_m2:meanInput,mean_outgoing_w_m2:meanOutgoing},
    assumptions:['Steady grey energy balance on a smooth sphere; no generated terrain.',
      'Prescribed albedo, infrared opacity and heat redistribution; no radiative-convective or circulation solution.',
      'No winds, clouds, seasons, evaporation dynamics or chemical evolution are calculated.',
      planet==='silicate'?'Fixed dayside; local rock vapor pressure is a capped illustrative exponential proxy.':
        'Atmospheric pressure is a prescribed uniform inventory, not simulated weather.'],
    grid:{...grid,description:'Equal-area latitude bands; north to south, longitude 0° eastward.'}};
}
export function surfacePlausibility(planet,atmosphere,estimate) {
  const {min,max}=estimate.statistics,c=estimate.config;
  if(planet==='ice'&&max>260)return 'The ice preset is too warm for its assumed frozen surface.';
  if(planet==='volatile'&&(max>200||c.pressure>0.8*volatileSaturationBar(atmosphere,min)))return 'This cold atmosphere may condense; raise sunlight or reduce pressure.';
  if(planet==='venus'&&(min<450||max>1100))return 'This falls outside the dense, hot CO₂ surface assumptions.';
  if(planet==='steam'&&min<650)return 'The steam estimate needs all cells above 650 K; increase sunlight or pressure.';
  if(planet==='silicate'&&(max<1700||max>3500))return 'The lava preset needs a dayside maximum of 1700–3500 K.';
  return null;
}
