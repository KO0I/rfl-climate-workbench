// Eighteen terrestrial biomes from the supplied color legend.
// Provisional visual classification, not measured precipitation or ecology.
// Keeps RFL's 5 x 4 editable palette independent.
export const BIOMES=Object.freeze([
 {
  "index": 0,
  "id": "ice-sheet-polar-desert",
  "label": "Ice sheet and polar desert",
  "color": "#b2b2b2"
 },
 {
  "index": 1,
  "id": "tundra",
  "label": "Tundra",
  "color": "#9acabe"
 },
 {
  "index": 2,
  "id": "taiga",
  "label": "Taiga",
  "color": "#23544e"
 },
 {
  "index": 3,
  "id": "temperate-broadleaf-forest",
  "label": "Temperate broadleaf forest",
  "color": "#a0d65e"
 },
 {
  "index": 4,
  "id": "temperate-steppe-savanna",
  "label": "Temperate steppe and savanna",
  "color": "#f2e771"
 },
 {
  "index": 5,
  "id": "subtropical-evergreen-forest",
  "label": "Subtropical evergreen forest",
  "color": "#2e661d"
 },
 {
  "index": 6,
  "id": "mediterranean-vegetation",
  "label": "Mediterranean vegetation",
  "color": "#766182"
 },
 {
  "index": 7,
  "id": "monsoon-forest-mosaic",
  "label": "Monsoon forests and mosaic",
  "color": "#61815c"
 },
 {
  "index": 8,
  "id": "arid-desert",
  "label": "Arid desert",
  "color": "#78462f"
 },
 {
  "index": 9,
  "id": "xeric-shrubland",
  "label": "Xeric shrubland",
  "color": "#9f6245"
 },
 {
  "index": 10,
  "id": "dry-steppe-thorn-forest",
  "label": "Dry steppe and thorn forest",
  "color": "#84703d"
 },
 {
  "index": 11,
  "id": "semiarid-desert",
  "label": "Semiarid desert",
  "color": "#ceaa78"
 },
 {
  "index": 12,
  "id": "grass-savanna",
  "label": "Grass savanna",
  "color": "#c0bd54"
 },
 {
  "index": 13,
  "id": "tree-savanna",
  "label": "Tree savanna",
  "color": "#9a9531"
 },
 {
  "index": 14,
  "id": "dry-forest-woodland-savanna",
  "label": "Dry forest and woodland savanna",
  "color": "#657931"
 },
 {
  "index": 15,
  "id": "tropical-rainforest",
  "label": "Tropical rainforest",
  "color": "#1a450f"
 },
 {
  "index": 16,
  "id": "alpine-tundra",
  "label": "Alpine tundra",
  "color": "#9aadce"
 },
 {
  "index": 17,
  "id": "montane-forests-grasslands",
  "label": "Montane forests and grasslands",
  "color": "#448182"
 }
].map(b=>Object.freeze(b)));
export const WATER_BIOME=255;
const IDS=Object.freeze(Object.fromEntries(BIOMES.map(b=>[b.id,b.index])));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function classifyBiome({temperatureC,moisture,latitudeDeg=0,elevationM=0}){
 if(![temperatureC,moisture,latitudeDeg,elevationM].every(Number.isFinite))
  throw new Error('Biome classification requires finite temperature, moisture, latitude and elevation.');
 const t=temperatureC,wet=clamp(moisture,0,1),lat=Math.abs(latitudeDeg);
 if(t<=-11)return IDS['ice-sheet-polar-desert'];
 if(t<=1)return IDS.tundra;
 if(elevationM>=2800||(elevationM>=2100&&t<=7))return IDS['alpine-tundra'];
 if(elevationM>=1350&&t<23&&wet>=.44)return IDS['montane-forests-grasslands'];
 if(t<9){
  if(wet<.18)return IDS['semiarid-desert'];
  if(wet<.29)return IDS['dry-steppe-thorn-forest'];
  return IDS.taiga;
 }
 if(t<18){
  if(wet<.12)return IDS['arid-desert'];
  if(wet<.23)return IDS['semiarid-desert'];
  if(wet<.36)return IDS['dry-steppe-thorn-forest'];
  if(lat>=27&&lat<=48&&wet>=.39&&wet<.64)return IDS['mediterranean-vegetation'];
  if(wet<.63)return IDS['temperate-steppe-savanna'];
  return IDS['temperate-broadleaf-forest'];
 }
 if(t<24){
  if(wet<.12)return IDS['arid-desert'];
  if(wet<.25)return IDS['xeric-shrubland'];
  if(wet<.36)return IDS['dry-steppe-thorn-forest'];
  if(lat>=25&&lat<=44&&wet<.62)return IDS['mediterranean-vegetation'];
  if(wet<.49)return IDS['temperate-steppe-savanna'];
  if(wet<.68)return IDS['dry-forest-woodland-savanna'];
  return IDS['subtropical-evergreen-forest'];
 }
 if(wet<.10)return IDS['arid-desert'];
 if(wet<.21)return IDS['xeric-shrubland'];
 if(wet<.29)return IDS['semiarid-desert'];
 if(wet<.39)return IDS['grass-savanna'];
 if(wet<.49)return IDS['tree-savanna'];
 if(wet<.63)return IDS['dry-forest-woodland-savanna'];
 if(wet<.78)return IDS['monsoon-forest-mosaic'];
 return IDS['tropical-rainforest'];
}
export function accumulateBiomeClimate(normals,frame){
 if(!frame||!frame.grid||!frame.fields)return normals;
 const n=frame.grid.cells,steps=frame.steps;
 if(!Number.isInteger(n)||n<1||frame.fields.length<2*n)throw new Error('Invalid climate frame for biome averages.');
 if(normals&&normals.cells===n&&normals.lastSteps===steps)return normals;
 if(!normals||normals.cells!==n||(Number.isFinite(normals.lastSteps)&&steps<normals.lastSteps)){
  normals={cells:n,longitude:frame.grid.longitude,latitude:frame.grid.latitude,samples:0,lastSteps:null,
   temperatureK:new Float32Array(n),cloudFraction:new Float32Array(n)};
 }
 const weight=1/(++normals.samples);
 for(let i=0;i<n;i++){
  const t=frame.fields[i],cloud=frame.fields[n+i];
  if(!Number.isFinite(t)||!Number.isFinite(cloud))throw new Error('Climate frame contains non-finite biome inputs.');
  normals.temperatureK[i]+=(t-normals.temperatureK[i])*weight;
  normals.cloudFraction[i]+=(clamp(cloud,0,1)-normals.cloudFraction[i])*weight;
 }
 normals.lastSteps=steps;
 return normals;
}
export function generateBiomeLayer({terrain,climate=null,climateTerrain=terrain,planet='temperate',seed=0}){
 if(!['cold','temperate','warm'].includes(planet))throw new Error('Biomes are available only for habitable rocky-world experiments.');
 const {width,rows,land,elevation,sinLat}=terrain||{};
 if(!Number.isInteger(width)||!Number.isInteger(rows)||width<1||rows<1||
    land?.length!==width*rows||elevation?.length!==width*rows||sinLat?.length!==rows)
  throw new Error('Biome layer requires a complete terrestrial grid.');
 const hasClimate=Boolean(climate&&climate.cells&&climate.temperatureK?.length===climate.cells&&
   climate.cloudFraction?.length===climate.cells&&climate.longitude*climate.latitude===climate.cells);
 const phase=Number.isFinite(seed)?((seed>>>0)%65521)/65521*2*Math.PI:0;
 const shift=planet==='cold'?-9:planet==='warm'?6:0;
 const ids=new Uint8Array(width*rows),counts=new Uint32Array(BIOMES.length);
 for(let y=0;y<rows;y++){
  const lat=Math.asin(clamp(sinLat[y],-1,1)),latDeg=lat*180/Math.PI,absLat=Math.abs(latDeg);
  const dryBelt=Math.exp(-(((absLat-29)/12)**2)),equatorial=Math.exp(-((absLat/17)**2));
  for(let x=0;x<width;x++){
   const i=y*width+x;
   if(land[i]<.5){ids[i]=255;continue;}
   const lon=2*Math.PI*x/width,landHeight=Math.max(0,elevation[i]);
   const geographic=.52+.26*Math.sin(lon*1.9+phase+1.3*Math.sin(lat))*Math.cos(lat)+
     .16*Math.sin(lon*4.1-lat*2.7-phase*.7)-.27*dryBelt+.10*equatorial;
   let moisture=clamp(geographic,0,1),temperatureC=30-56*Math.sin(lat)**2+shift-.0065*landHeight;
   if(hasClimate){
    const cx=Math.min(climate.longitude-1,Math.floor(x*climate.longitude/width));
    const cy=Math.min(climate.latitude-1,Math.floor(y*climate.latitude/rows));
    const ci=cy*climate.longitude+cx;
    const coarseElevation=climateTerrain?.elevation?.[ci]??landHeight;
    temperatureC=climate.temperatureK[ci]-273.15-.0065*(landHeight-coarseElevation);
    // Cloud amount is NOT rainfall; it is only a weak provisional moisture proxy.
    moisture=clamp(.23+.67*clamp(climate.cloudFraction[ci],0,1)+.40*(geographic-.52),0,1);
   }
   const west=y*width+(x+width-1)%width,east=y*width+(x+1)%width;
   if(land[west]<.5||land[east]<.5||
      (y>0&&land[i-width]<.5)||(y+1<rows&&land[i+width]<.5))moisture=clamp(moisture+.055,0,1);
   const index=classifyBiome({temperatureC,moisture,latitudeDeg:latDeg,elevationM:landHeight});
   ids[i]=index;counts[index]++;
  }
 }
 return {ids,counts,provisional:true,usesSimulatedTemperature:hasClimate,moistureSource:hasClimate?'Cloud-cover proxy':'Latitude and geographic noise'};
}
