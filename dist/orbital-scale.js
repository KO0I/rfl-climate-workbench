// Match flight-scale.js: one world unit is 6.371 km.
// Original outer radius: 3,695 world units = 47,081.69 km diameter.
export const ORIGINAL_ORBITAL_DIAMETER_KM=3695*2*6.371;
// Open diameter is measured between the reference inner deck surfaces.
export const ORBITAL_OPEN_DIAMETER_KM=3000000,ORBITAL_WIDTH_KM=6000;
export const ORBITAL_HALF_WIDTH=ORBITAL_WIDTH_KM/(2*6.371);
// Preserve local relief, structures and flight handling as the band grows.
export const ORBITAL_SECTION_SCALE=(16/(2*6.371))/144;
export const ORBITAL_INNER_RADIUS=ORBITAL_OPEN_DIAMETER_KM/(2*6.371);
// Physical deck gravity at the current radius. The old four-minute demo day
// swept hundreds of kilometres per frame after the ring was enlarged.
export const ORBITAL_DAY_PERIOD=2*Math.PI*Math.sqrt(ORBITAL_OPEN_DIAMETER_KM*500/9.80665);
export const ORBITAL_RADIUS=ORBITAL_INNER_RADIUS+30*ORBITAL_SECTION_SCALE;
// Keep nearby planets outside the enlarged Orbital navigation envelope.
export const ORBITAL_SYSTEM_DISTANCE=ORBITAL_RADIUS*2+11824;
export const ORBITAL_DIAMETER_KM=ORBITAL_RADIUS*2*6.371;
// Atmosphere depth is independent of the deck width and terrain scale.
export const ORBITAL_ATMOSPHERE_KM=8;
export function orbitalDimensions(){
 return {radius:ORBITAL_RADIUS,innerRadius:ORBITAL_INNER_RADIUS,
  halfWidth:ORBITAL_HALF_WIDTH,sectionScale:ORBITAL_SECTION_SCALE,
  rimHeight:8/6.371,rimWidth:20/6.371,
  terrainMaterialScale:.025,
  seaLevel:0,atmosphere:ORBITAL_ATMOSPHERE_KM/6.371,dayPeriod:ORBITAL_DAY_PERIOD,
  hillRadius:ORBITAL_RADIUS*1.4};
}
