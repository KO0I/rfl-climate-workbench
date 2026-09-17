// Appearance layers following the supplied Jupiter cloud-deck reference.
// Radii are deliberately exaggerated; glass, transparency and glow are artistic.
export const JUPITER_LAYERS = [
 {id:'haze',name:'Stratospheric haze',short:'Haze',radius:1,color:'#dec995',
  description:'Cloud tops beneath a thin haze: cream and cool-gray zones, uneven rust belts, folded wakes, white ovals and a swirling Great Red Spot. Neighboring jets flow at different speeds and directions; motion is an accelerated visual interpretation of the reference.',
  defaults:{color:'#e6e6df',accent:'#967253',detail:1.25,wave:.75,turbulence:1.15,flow:1,pattern:'jets',palette:'color',storm:1}},
 {id:'ammonia',name:'Ammonia ice',short:'Ammonia ice',radius:.88,color:'#f4e6cb',
  description:'The upper tropospheric cloud deck: bright ammonia ice, dark belts, rolling eddies and an oval Great Red Spot. Appearance and motion are illustrative.',
  defaults:{color:'#f6e6c9',accent:'#a65b38',detail:1,wave:1,turbulence:1,flow:1.1,pattern:'jets',palette:'color',storm:1}},
 {id:'hydrosulfide',name:'Ammonium hydrosulfide ice',short:'NH₄SH ice',radius:.75,color:'#da7b40',
  description:'An orange-brown ammonium hydrosulfide deck below the ammonia clouds, interpreted as folded belts and dense convection cells.',
  defaults:{color:'#e49b59',accent:'#8f3525',detail:1.2,wave:.75,turbulence:1.25,flow:.85,pattern:'cells',palette:'color',storm:.8}},
 {id:'water',name:'Water ice',short:'Water ice · glass',radius:.61,color:'#26b6b0',
  description:'The water-cloud deck interpreted as blue-green glass: maximum refraction, midpoint surface scattering, and a red-orange center glowing through the shell. This is an artistic material, not transparent planetary ice.',
  defaults:{color:'#26b6b0',accent:'#9bd5c8',detail:.55,wave:.45,turbulence:.8,flow:.7,pattern:'filaments',palette:'color',storm:.35,ior:2.5,scatter:.5,dispersion:.6,absorption:.18,reflection:.22,cloudOpacity:.16}},
 {id:'hydrogen',name:'Molecular hydrogen & helium',short:'Hydrogen & helium',radius:.46,color:'#cf5d27',
  description:'Hydrogen and helium beneath the water clouds, with trace methane, ammonia and water. The deep envelope is compressed into a translucent amber layer so the glowing center remains visible; real hydrogen becomes a dense fluid with depth.',
  defaults:{color:'#d97732',accent:'#842c21',detail:.65,turbulence:.8,flow:.5,pattern:'cells',palette:'color',wave:0,storm:0,opacity:.18}},
 {id:'metal',name:'Metallic hydrogen',short:'Metallic hydrogen',radius:.61*12/26,color:'#ff611f',
  description:'A reflective metallic-hydrogen center with an internal red-orange glow, using Saturn’s mirror-core proportions. Actual Jupiter has a metallic-hydrogen region surrounding a diffuse, heavy-element-rich interior, not a sharply bounded mirror ball.',
  defaults:{color:'#c1b9b1',accent:'#ff631e',reflection:.96,scatter:.08,flow:.35,emission:1.2,emissionColor:'#ff5318'}}
];

export const makeJupiterConfigs=()=>JUPITER_LAYERS.map(layer=>({...layer.defaults}));
