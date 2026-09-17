// Artistic layer spacing, not a radial/pressure model of Saturn.
// The water-to-metal radius ratio comes from XPM Workbench's Drone B.
export const SATURN_LAYERS = [
 {id:'haze',name:'Stratospheric haze',short:'Haze',radius:1,color:'#a6bcc9',
  description:'A thin, blue-gray veil over muted gold bands, with stretched filaments around the polar jets.',
  defaults:{color:'#cfbea0',accent:'#91bbc7',detail:.65,wave:1,turbulence:.45,flow:1,pattern:'filaments',palette:'color'}},
 {id:'ammonia',name:'Ammonia ice',short:'Ammonia ice',radius:.88,color:'#f1d496',
  description:'Pale ammonia cloud tops: cream ridges, ochre belts and small rolling eddies.',
  defaults:{color:'#efd297',accent:'#93714f',detail:1,wave:1,turbulence:.85,flow:1.1,pattern:'jets',palette:'color'}},
 {id:'hydrosulfide',name:'Ammonium hydrosulfide ice',short:'NH₄SH ice',radius:.75,color:'#d86743',
  description:'A speculative deeper deck. The infrared interpretation puts dark storm silhouettes against red thermal emission, with a green haze boundary.',
  defaults:{color:'#e14927',accent:'#23bd78',detail:1.35,wave:1,turbulence:1.3,flow:.8,pattern:'cells',palette:'infrared'}},
 {id:'water',name:'Water ice',short:'Water ice · glass',radius:.61,color:'#cde3e5',
  description:'Water clouds interpreted as the neutral drone’s clear glass shell, enclosing a mirror center. Pale cloud streaks carry both polar polygons.',
  defaults:{color:'#ffffff',accent:'#e6e6e6',detail:.7,wave:1,turbulence:.8,flow:.7,pattern:'filaments',palette:'color',ior:1.5,scatter:.15,dispersion:.99,absorption:.08,reflection:.28,cloudOpacity:.25}},
 {id:'metal',name:'Metallic hydrogen',short:'Metallic hydrogen',radius:.61*12/26,color:'#bdc6cf',
  description:'The deepest layer in this interpretation: a reflective fluid-hydrogen sphere, using the neutral drone’s mirror core.',
  defaults:{color:'#b8c1c9',accent:'#e6e6e6',reflection:.96,scatter:.08,flow:.35}}
];
export const WATER_LAYER=3,CORE_LAYER=4;
export const makeLayerConfigs=()=>SATURN_LAYERS.map(layer=>({...layer.defaults}));
export const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));

// Parse the same geometry/material directives used by XPM Workbench's renderer.
export function readDroneXpm(source){
 const sphere=source.match(/^! xpm-workbench glass-sphere (.*)$/m)?.[1].split(' ').map(Number);
 const core=Number(source.match(/^! xpm-workbench drone-inner-radius ([\d.]+)$/m)?.[1]);
 if(!sphere||sphere.length!==4||!sphere.every(Number.isFinite)||!Number.isFinite(core)||core<=0||core>=sphere[3])throw new Error('Invalid drone sphere geometry');
 const values={};
 for(const [key,name] of [['ior','refractive-index'],['scatter','surface-roughness'],['dispersion','dispersion'],['absorption','absorption']]){
  values[key]=Number(source.match(new RegExp('^! xpm-workbench '+name+' ([\\d.]+)$','m'))?.[1]);
  if(!Number.isFinite(values[key]))throw new Error('Invalid drone material');
 }
 return {ratio:core/sphere[3],...values};
}
