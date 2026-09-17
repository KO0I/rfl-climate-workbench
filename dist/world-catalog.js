// Appearance palettes are visual references, not measured gas spectra.
// Order: illuminated horizon through the atmospheric bands to the edge of space.
// RFL anchors below are exact RGB constants from apply_atmosphere() in
// raycaster_planet.c, rfl_PLAYTEST.zip (Library version 15).
// Stop positions are a palette layout, not RFL's view-dependent ray integration.
import './model-config.js';
import {canEstimate,surfaceProfiles,surfaceBounds,defaultSurfaceConfig,estimateSurface,surfacePlausibility,validateSurfaceConfig} from './surface-model.js';
const rflEarthlike = {
  colors: ['#d2eeff', '#4cb8f2', '#145cdc', '#071b60'], // pale, cyan, electric_blue, deep_blue
  labels: ['Horizon', 'Cyan limb', 'Electric blue', 'Outer edge'],
  positions: [0, 30, 58, 82],
  space: '#040713', // deep_space_color() zenith base, before stars and directional blending
  source: {
    project: 'RFL', file: 'raycaster_planet.c', function: 'apply_atmosphere',
    archive: 'rfl_PLAYTEST.zip', library_version: 15,
    archive_sha256: '27853ecc2d70f5f1590620ec1af98e2df322cce8342ffc5ca75f7018d0de4f68',
    space_function: 'deep_space_color',
    note: 'Exact daytime color anchors; illustrative gradient positions. RFL blends these by view, density and sunlight, with additional twilight and night colors.'
  }
};
export const atmospheres = {
  nitrogen: {name:'Nitrogen-rich · Earth-like (RFL)', ...rflEarthlike, description:'RFL Earthlike: pale blue horizon · cyan limb · electric blue band · deep blue outer edge', model:true},
  oxygen: {name:'Oxygen', colors:['#e0f4fa','#6aa9df','#142745'], description:'Ice-blue horizon · soft blue upper atmosphere · navy edge'},
  co2: {name:'Carbon dioxide', colors:['#f4cd98','#c58060','#392438'], description:'Peach horizon · copper upper atmosphere · plum edge'},
  co2rich: {name:'Carbon dioxide-rich', colors:['#f9dfb0','#d6a16b','#493343'], description:'Cream horizon · ochre upper atmosphere · dusky violet edge'},
  water: {name:'Water vapor', colors:['#edf5f4','#9ecad8','#213e61'], description:'White horizon · mist-blue upper atmosphere · slate edge'},
  waterrich: {name:'Water-rich', colors:['#f4e8d1','#b9c4d4','#373c5d'], description:'Pearl horizon · silver-blue upper atmosphere · violet edge'},
  ammonia: {name:'Ammonia', colors:['#efecbd','#afbc88','#304446'], description:'Lemon horizon · muted green upper atmosphere · dark teal edge'},
  ammoniarich: {name:'Ammonia-rich', colors:['#e5eaca','#9cae9b','#283d4c'], description:'Pale green horizon · sage upper atmosphere · blue-gray edge'},
  methane: {name:'Methane', colors:['#f4d595','#c29861','#383448'], description:'Amber haze at the horizon · muted gold above · violet edge'},
  methanerich: {name:'Methane-rich', colors:['#efc483','#a67d60','#332e48'], description:'Golden horizon · bronze upper haze · violet edge'},
  argon: {name:'Argon', colors:['#edcff1','#a681d9','#302453'], description:'Lilac horizon · violet upper atmosphere · indigo edge'},
  argonrich: {name:'Argon-rich', colors:['#e7dafa','#958dd6','#292c55'], description:'Lavender horizon · periwinkle upper atmosphere · indigo edge'},
  neon: {name:'Neon', colors:['#d2f3ed','#65c6c6','#183954'], description:'Mint horizon · turquoise upper atmosphere · blue edge'},
  neonrich: {name:'Neon-rich', colors:['#d7f0e8','#83bcbf','#243e58'], description:'Pale mint horizon · muted cyan upper atmosphere · slate edge'},
  helium: {name:'Helium', colors:['#f4e8db','#a3b9d9','#282c52'], description:'Pearl horizon · pale blue upper atmosphere · indigo edge'},
  sulphur: {name:'Sulphur dioxide', colors:['#fce2a2','#cead54','#4f3c36'], description:'Yellow horizon · gold upper haze · umber edge'},
  metallic: {name:'Metallic vapor', colors:['#f8ddcd','#b28c9c','#39354e'], description:'Rose-white horizon · mauve upper atmosphere · violet edge'},
  silicate: {name:'Silicate vapor', colors:['#ffda99','#e28556','#522e46'], description:'Incandescent amber horizon · orange upper haze · dark plum edge'},
  none: {name:'No atmosphere', colors:['#080e18','#080e18','#080e18'], description:'No atmospheric scattering · black sky'}
};
export const worlds = {
  ice: {name:'Icy body', group:'Cold worlds', atmosphere:'none', atmospheres:['none'], regime:'Ice-dominated surface', detail:'An icy surface; the default airless preset has no atmospheric scattering.', reason:'Airless surfaces and icy-body boundary conditions are outside this atmospheric climate configuration.'},
  volatile: {name:'Icy volatile world', group:'Cold worlds', atmosphere:'methane', atmospheres:['methane','methanerich','nitrogen','argon','argonrich','neon','neonrich','ammonia','ammoniarich'], regime:'Frozen surface · volatile atmosphere', detail:'Explore cold-world haze and tenuous atmospheric colors.', reason:'Volatile ice chemistry and exotic cold-world boundary conditions are outside this port.'},
  cold: {name:'Cool rocky world', group:'Rocky climates', atmosphere:'nitrogen', atmospheres:['nitrogen','co2','co2rich','argon','oxygen'], regime:'Reduced sunlight · rocky climate experiment', detail:'Lower stellar flux on the model’s Earth geography; an icy outcome is not guaranteed.', model:{flux:1050,co2:360,rotation:1}, ranges:{flux:[850,1150],co2:[100,700],rotation:[0.5,3]}},
  temperate: {name:'Temperate rocky world', group:'Rocky climates', atmosphere:'nitrogen', atmospheres:['nitrogen','oxygen','water','waterrich'], regime:'Earth-like forcing · rocky climate experiment', detail:'An Earth-like starting point for weather and climate exploration.', model:{flux:1367,co2:360,rotation:1}, ranges:{flux:[1200,1450],co2:[200,800],rotation:[0.5,3]}},
  warm: {name:'Warm rocky world', group:'Rocky climates', atmosphere:'nitrogen', atmospheres:['nitrogen','co2','co2rich','water'], regime:'Stronger sunlight · rocky climate experiment', detail:'A higher-flux experiment; short runs do not establish a stable warm climate.', model:{flux:1550,co2:800,rotation:1}, ranges:{flux:[1450,1650],co2:[500,1400],rotation:[0.5,5]}},
  venus: {name:'Venus-like greenhouse', group:'Hot & extreme worlds', atmosphere:'co2', atmospheres:['co2','co2rich','sulphur'], regime:'Hot surface · dense greenhouse atmosphere', detail:'Warm ochre and copper palettes suggest a cloudy, haze-dominated world.', reason:'Dense CO₂ atmospheres and Venus-like clouds need physics beyond this browser configuration.'},
  steam: {name:'Boiling steam world', group:'Hot & extreme worlds', atmosphere:'water', atmospheres:['water','waterrich','co2rich'], regime:'Hot surface · water-vapor envelope', detail:'A bright horizon fading through a thick, mist-colored atmosphere.', reason:'A steam-dominated atmosphere cannot be represented by this Earth-like configuration.'},
  silicate: {name:'Molten silicate world', group:'Hot & extreme worlds', atmosphere:'silicate', atmospheres:['silicate','metallic','sulphur'], regime:'Molten rock · rock-vapor atmosphere', detail:'An extremely hot rocky world with an amber-to-plum atmosphere palette.', reason:'Rock vapor, mineral condensation and molten surfaces are outside ExoPlaSim’s implemented physics here.'}
};
export function canSimulate(worldId, atmosphereId) {
  return Boolean(worlds[worldId]?.model && atmospheres[atmosphereId]?.model);
}
export function climateSupport(worldId, atmosphereId) {
  if (!worlds[worldId]) return {supported:false, reason:'Choose a listed planet type.'};
  if (!atmospheres[atmosphereId]) return {supported:false, reason:'Choose a listed atmosphere type.'};
  if(canEstimate(worldId,atmosphereId))return {supported:true,mode:'surface-estimate',reason:surfaceProfiles[worldId].description+' Temperature and pressure use a simplified steady energy balance. Winds and clouds are not calculated.'};
  if (!worlds[worldId].model) return {supported:false, reason:worlds[worldId].reason};
  if (!atmospheres[atmosphereId].model) return {supported:false, reason:'This atmosphere is a color preview only. The compiled model uses nitrogen-rich air with water and trace CO₂; selecting this palette does not replace its gases.'};
  return {supported:true,mode:'exoplasim', reason:'RFL terrestrial geography · nitrogen-rich air with water and trace CO₂ · reference pressure 1.011 bar. Sunlight, CO₂ and rotation are adjustable.'};
}
export function paletteGradient(atmosphereId, direction='90deg') {
  const a=atmospheres[atmosphereId];
  const positions=a.positions||[0,48,82];
  const stops=a.colors.map((hex,i)=>`${hex} ${positions[i]}%`);
  return `linear-gradient(${direction}, ${stops.join(', ')}, ${a.space||'#080e18'} 100%)`;
}
// Curated exploration priors, NOT measured planet occurrence probabilities or
// habitability limits. Class labels describe forcing, not an equilibrated climate.
// Conditional bounds avoid combining the strongest heating/cooling extremes.
export const randomProfiles = {
  cold: {weight:15, flux:[1050,1250], mode:1180},
  temperate: {weight:35, flux:[1250,1420], mode:1367},
  warm: {weight:15, flux:[1420,1500], mode:1450},
  ice: {weight:8}, volatile: {weight:8}, venus: {weight:8}, steam: {weight:6}, silicate: {weight:5}
};
export function randomCO2Bounds(flux) {
  if(flux<1150) return [400,900];
  if(flux<1250) return [280,900];
  if(flux<1420) return [180,700];
  if(flux<=1450) return [100,450];
  return [100,300];
}
export function validateRandomWorld(result,preset='low') {
  if(!result || !climateSupport(result.planet,result.atmosphere).supported) throw new Error('Random worlds must support surface fields.');
  if(canEstimate(result.planet,result.atmosphere)) {
    const c=validateSurfaceConfig(result.planet,result.atmosphere,result.config);
    const issue=surfacePlausibility(result.planet,result.atmosphere,estimateSurface(result.planet,result.atmosphere,c,preset));
    if(issue)throw new Error(issue);
    return {...result,mode:'surface-estimate',config:c};
  }
  const c=globalThis.ExoConfig.validate(result.config), p=randomProfiles[result.planet];
  if(!p || c.flux<p.flux[0] || c.flux>p.flux[1]) throw new Error('Sunlight is outside the random world’s range.');
  const [lo,hi]=randomCO2Bounds(c.flux);
  if(c.co2<lo || c.co2>hi) throw new Error('CO₂ is outside the random range for this sunlight.');
  if(c.rotation<0.8 || c.rotation>3) throw new Error('Random rotation must be 0.8–3 Earth days.');
  return {...result,mode:'exoplasim',config:c};
}
export function randomWorld(_current, days=10, rng=Math.random,preset='low') {
  globalThis.ExoConfig.resolution(preset);
  if(![1,10,30,360].includes(days))throw new Error('Choose a run length of 1, 10, 30, or 360 days.');
  const unit=()=>{const n=rng();if(!Number.isFinite(n)||n<0||n>1)throw new Error('Invalid random sample.');return Math.min(n,1-Number.EPSILON);};
  const triangle=(lo,mode,hi)=>{const u=unit(),split=(mode-lo)/(hi-lo);return u<split?lo+Math.sqrt(u*(hi-lo)*(mode-lo)):hi-Math.sqrt((1-u)*(hi-lo)*(hi-mode));};
  let roll=unit()*100;
  const planet=Object.keys(randomProfiles).find(id=>(roll-=randomProfiles[id].weight)<0);
  if(surfaceProfiles[planet]) {
    // Conditional composition: retain thick nitrogen or thin methane on cold
    // worlds; CO₂ for greenhouse worlds; steam for hot water; rock vapor for lava.
    const choices=surfaceProfiles[planet].atmospheres;
    const atmosphere=planet==='volatile'?(unit()<0.75?'nitrogen':'methanerich'):choices[Math.floor(unit()*choices.length)];
    const p=surfaceBounds(planet,atmosphere),between=([lo,hi])=>lo+(hi-lo)*unit();
    // Bounded rejection screening never loops indefinitely. The selected class
    // keeps its stated probability; a checked reference case ends rare failures.
    for(let attempt=0;attempt<64;attempt++) {
      const config={flux:Math.round(between(p.flux)),rotation:Math.round(between(p.rotation)*10)/10,
        albedo:Math.round(between(p.albedo)*100)/100,
        pressure:planet==='ice'||planet==='silicate'?0:Math.max(p.pressure[0],Math.min(p.pressure[1],Math.exp(between(p.pressure.map(Math.log)))))};
      const estimate=estimateSurface(planet,atmosphere,config,preset);
      if(!surfacePlausibility(planet,atmosphere,estimate))return validateRandomWorld({planet,atmosphere,config},preset);
    }
    return validateRandomWorld({planet,atmosphere,config:defaultSurfaceConfig(planet,atmosphere)},preset);
  }
  const p=randomProfiles[planet],flux=Math.round(triangle(p.flux[0],p.mode,p.flux[1]));
  const [lo,hi]=randomCO2Bounds(flux),mode=flux<1250?600:flux<1420?360:220;
  // Log space concentrates variation by ratios around a moderate CO₂ mode.
  const co2=Math.round(Math.exp(triangle(Math.log(lo),Math.log(mode),Math.log(hi))));
  const rotation=Math.round((unit()<0.8?triangle(0.8,1,1.6):triangle(1.6,2,3))*10)/10;
  // A class may repeat: excluding it would distort the stated exploration priors.
  // Validate against both the generator's coupled rules and the actual worker bounds.
  return validateRandomWorld({planet,atmosphere:'nitrogen',config:{flux,co2,rotation,days}});
}
