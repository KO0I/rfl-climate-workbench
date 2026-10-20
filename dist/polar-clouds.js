import {preparePolarFlow} from './polar-flow.js';
const TAU=2*Math.PI,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const normalize=p=>{const l=Math.hypot(...p)||1;return p.map(v=>v/l);};
const object=p=>({x:p[0],y:p[1],z:p[2]});
function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
function noise(p,seed){
 const q=p.map(Math.floor),f=p.map((v,k)=>smooth(v-q[k]));
 const hash=(x,y,z)=>{let n=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,1442695041)^seed;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
 let sum=0;for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++)sum+=hash(q[0]+x,q[1]+y,q[2]+z)*(x?f[0]:1-f[0])*(y?f[1]:1-f[1])*(z?f[2]:1-f[2]);return sum;
}
export function validateFlowState(s){
 if(!s||!['stable','polygon','chaotic'].includes(s.regime)||!Number.isInteger(s.m)||s.m<0||s.m>10)throw Error('Invalid polar regime');
 for(const k of ['Ro','E','time','phaseN','phaseS'])if(!Number.isFinite(s[k]))throw Error('Invalid flow '+k);
 if(!(s.Ro>0&&s.Ro<=1&&s.E>0&&s.E<=.001))throw Error('Flow parameters outside export range');
 if(!Array.isArray(s.storms)||s.storms.length>2)throw Error('Invalid oval storms');
 for(const storm of s.storms){for(const k of ['lat','lon','sigma','gamma','age','life'])if(!Number.isFinite(storm[k]))throw Error('Invalid storm '+k);if(storm.sigma<=0||storm.life<=0||storm.age<0||storm.age>storm.life||Math.abs(storm.lat)>90)throw Error('Invalid storm bounds');}
}
export function encodePolarClouds(state,{width=128,seed=1610,coverage=.58}={}){
 validateFlowState(state);
 if(![128,256].includes(width)||!Number.isInteger(seed)||seed<0||seed>4294967295||!Number.isFinite(coverage)||coverage<.1||coverage>.95)throw Error('Invalid cloud export settings');
 const height=width/2,flow=preparePolarFlow(state),count=width*height;
 const clouds=new Uint8Array(count*4),velocities=new Float32Array(count*3),wind=new Uint8Array(count*4);
 const layers=[1,.955,.91,.865].map((radius,i)=>({name:['Upper haze','Upper clouds','Middle clouds','Deep clouds'][i],radius_ratio:radius,thickness_ratio:.025,wind_multiplier:1+i*.13,coverage_channel:i}));
 let maxWind=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const lat=(.5-y/(height-1))*Math.PI,lon=((x+.5)/width-.5)*TAU;
  const n=y===0?[0,1,0]:y===height-1?[0,-1,0]:[Math.cos(lat)*Math.cos(lon),Math.sin(lat),Math.cos(lat)*Math.sin(lon)];
  const index=y*width+x,v=flow(object(n));
  for(let k=0;k<3;k++){velocities[index*3+k]=v[k];maxWind=Math.max(maxWind,Math.abs(v[k]));}
  for(let layer=0;layer<4;layer++){
   // Backtrace a seeded spherical noise field through the SAME wind as the
   // displayed globe. Shared low-frequency noise keeps the decks coherent.
   let p=n;const dt=.25*layers[layer].wind_multiplier;
   for(let step=0;step<12;step++){
    const a=flow(object(p)),mid=normalize(p.map((q,k)=>q-a[k]*dt*.5)),b=flow(object(mid));
    p=normalize(p.map((q,k)=>q-b[k]*dt));
   }
   const broad=noise(p.map(v=>v*9),seed),detail=noise(p.map(v=>v*28+layer*.41),seed+31);
   const filaments=noise(p.map(v=>v*65+layer*.17),seed+73);
   const bands=.5+.5*Math.sin(Math.asin(clamp(p[1],-1,1))*34+4*(broad-.5));
   const density=broad*.52+detail*.22+filaments*.10+bands*.16;
   clouds[index*4+layer]=Math.round(255*smooth((density-(1-coverage)*.72)/.35));
  }
 }
 const scale=Math.max(1e-6,maxWind/127);
 for(let i=0;i<count;i++){for(let k=0;k<3;k++)wind[i*4+k]=clamp(Math.round(velocities[i*3+k]/scale)+128,1,255);wind[i*4+3]=255;}
 return {format:'rfl-polar-clouds',version:1,model:'kinematic appearance; cloud density and layer depths are artistic',
  coordinates:{frame:'body-local',north:'+Y',longitude_zero:'+X',positive_longitude:'toward +Z',grid:'equirectangular',row_order:'north-to-south',longitude_samples:'cell centers: ((x+0.5)/width-0.5)*2*pi',latitude_samples:'pole-inclusive: (0.5-y/(height-1))*pi'},
  width,height,seed,coverage,flow_state:JSON.parse(JSON.stringify(state)),layers,
  density:{encoding:'base64-rgba8',channels:'one coverage layer per RGBA channel; value/255',data:base64(clouds)},
  wind:{encoding:'base64-rgba8',channels:'RGB = body-local tangent XYZ; A unused',bias:128,scale,units:'unit-sphere displacement per animation second',data:base64(wind)},
  animation:{suggested_time_scale:.05,renewal_seconds:16,mode:'frozen snapshot wind; two-phase advection',notes:'Live oval storms are captured at their current age. No future random storms are generated. Flow recipe retains current phases for analytic reuse.'}};
}
export function decodePolarClouds(pack){
 if(pack?.format!=='rfl-polar-clouds'||pack.version!==1)throw Error('Unsupported polar cloud pack');
 if(![128,256].includes(pack.width)||pack.height!==pack.width/2)throw Error('Invalid cloud dimensions');
 if(pack.coordinates?.frame!=='body-local'||pack.coordinates?.north!=='+Y'||pack.coordinates?.grid!=='equirectangular')throw Error('Unsupported cloud coordinates');
 validateFlowState(pack.flow_state);
 if(!Array.isArray(pack.layers)||pack.layers.length!==4)throw Error('Four cloud layers required');
 for(const [i,l] of pack.layers.entries())if(l.coverage_channel!==i||![l.radius_ratio,l.thickness_ratio,l.wind_multiplier].every(Number.isFinite)||l.radius_ratio<=0||l.thickness_ratio<=0||l.wind_multiplier<=0)throw Error('Invalid layer');
 if(pack.wind?.bias!==128||!Number.isFinite(pack.wind.scale)||pack.wind.scale<=0)throw Error('Invalid wind scale');
 function bytes(field){if(field?.encoding!=='base64-rgba8'||typeof field.data!=='string'||field.data.length!==Math.ceil(pack.width*pack.height*4/3)*4)throw Error('Invalid texture encoding');const data=Uint8Array.from(atob(field.data),c=>c.charCodeAt(0));if(data.length!==pack.width*pack.height*4)throw Error('Invalid texture size');return data;}
 return {pack,density:bytes(pack.density),wind:bytes(pack.wind)};
}
function sample(texture,width,height,n){
 n=normalize(n);const x=(Math.atan2(n[2],n[0])/TAU+.5)*width-.5,y=(.5-Math.asin(clamp(n[1],-1,1))/Math.PI)*(height-1),ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
 const result=[0,0,0,0];for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
  const xx=((ix+dx)%width+width)%width,yy=clamp(iy+dy,0,height-1),weight=(dx?fx:1-fx)*(dy?fy:1-fy);
  for(let c=0;c<4;c++)result[c]+=texture[(yy*width+xx)*4+c]*weight;
 }return result;
}
export function samplePolarCoverage(decoded,normal,layer=0,animationSeconds=0){
 if(!Number.isInteger(layer)||layer<0||layer>3||!Number.isFinite(animationSeconds)||normal.length!==3||!normal.every(Number.isFinite)||Math.hypot(...normal)===0)throw Error('Invalid cloud sample');
 const {pack:p,density,wind}=decoded,n=normalize(normal),v=sample(wind,p.width,p.height,n).slice(0,3).map(c=>(c-128)*p.wind.scale*p.layers[layer].wind_multiplier);
 const dot=n.reduce((s,x,k)=>s+x*v[k],0);for(let k=0;k<3;k++)v[k]-=n[k]*dot;
 const t=((animationSeconds%16)+16)%16,a=(t+8)%16-8,b=t-8,w=.5+.5*Math.cos(a*Math.PI/8);
 const read=dt=>sample(density,p.width,p.height,normalize(n.map((x,k)=>x-v[k]*dt)))[layer]/255;
 return read(a)*w+read(b)*(1-w);
}
// WebGL2: upload decoded.density and decoded.wind as RGBA8, LINEAR filtering,
// REPEAT in S, CLAMP_TO_EDGE in T, UNPACK_FLIP_Y_WEBGL=false, no sRGB conversion.
export const polarCloudGLSL=`
uniform sampler2D uPolarDensity,uPolarWind;
uniform vec2 uPolarSize;
uniform float uPolarWindScale;
uniform vec4 uPolarLayerFlow,uPolarRadii,uPolarThickness;
vec2 polarUV(vec3 n){n=normalize(n);return vec2(atan(n.z,n.x)/6.28318530718+.5,(.5-asin(clamp(n.y,-1.,1.))/3.14159265359)*(uPolarSize.y-1.)/uPolarSize.y+.5/uPolarSize.y);}
float polarChannel(vec4 c,int layer){return layer==0?c.r:layer==1?c.g:layer==2?c.b:c.a;}
float polarCoverage(vec3 bodyNormal,int layer,float animationSeconds){
 vec3 n=normalize(bodyNormal),v=(texture(uPolarWind,polarUV(n)).rgb*255.-128.)*uPolarWindScale*polarChannel(uPolarLayerFlow,layer);
 v-=n*dot(n,v);
 float t=mod(animationSeconds,16.),a=mod(t+8.,16.)-8.,b=t-8.,w=.5+.5*cos(a*3.14159265359/8.);
 float aCover=polarChannel(texture(uPolarDensity,polarUV(normalize(n-v*a))),layer);
 float bCover=polarChannel(texture(uPolarDensity,polarUV(normalize(n-v*b))),layer);
 return mix(bCover,aCover,w);
}
float polarVolume(vec3 bodyPositionOverRadius,float animationSeconds){
 float radius=length(bodyPositionOverRadius);if(radius<.0001)return 0.;
 float density=0.;
 for(int layer=0;layer<4;layer++){
  float h=abs(radius-polarChannel(uPolarRadii,layer))/(.5*polarChannel(uPolarThickness,layer));
  if(h<1.)density+=polarCoverage(bodyPositionOverRadius,layer,animationSeconds)*(1.-smoothstep(.55,1.,h));
 }
 return density;
}
`;

export function samplePolarVolume(decoded,bodyPositionOverRadius,animationSeconds=0){
 const radius=Math.hypot(...bodyPositionOverRadius);if(radius===0)return 0;
 let density=0;for(let i=0;i<4;i++){
  const l=decoded.pack.layers[i],h=Math.abs(radius-l.radius_ratio)/(l.thickness_ratio*.5);
  if(h<1)density+=samplePolarCoverage(decoded,bodyPositionOverRadius,i,animationSeconds)*(1-smooth((h-.55)/.45));
 }return density;
}
// Caller chooses texture units and program, and calls bind while that program
// is current. Creation restores GL bindings and pixel-upload state.
export function uploadPolarCloudTextures(gl,decoded){
 const oldTexture=gl.getParameter(gl.TEXTURE_BINDING_2D),oldFlip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),oldAlignment=gl.getParameter(gl.UNPACK_ALIGNMENT);
 const textures=[];
 try{
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
  for(const data of [decoded.density,decoded.wind]){
   const texture=gl.createTexture();if(!texture)throw Error('Cloud texture allocation failed');textures.push(texture);
   gl.bindTexture(gl.TEXTURE_2D,texture);
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,decoded.pack.width,decoded.pack.height,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  }
 }catch(error){for(const t of textures)gl.deleteTexture(t);throw error;}
 finally{gl.bindTexture(gl.TEXTURE_2D,oldTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,oldFlip);gl.pixelStorei(gl.UNPACK_ALIGNMENT,oldAlignment);}
 return {textures,bind(program,densityUnit,windUnit){
  const max=gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
  if(![densityUnit,windUnit].every(v=>Number.isInteger(v)&&v>=0&&v<max)||densityUnit===windUnit)throw Error('Choose two distinct available texture units');
  const loc=name=>gl.getUniformLocation(program,name),active=gl.getParameter(gl.ACTIVE_TEXTURE);
  for(const [i,unit] of [densityUnit,windUnit].entries()){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,textures[i]);}
  gl.activeTexture(active);
  gl.uniform1i(loc('uPolarDensity'),densityUnit);gl.uniform1i(loc('uPolarWind'),windUnit);
  gl.uniform2f(loc('uPolarSize'),decoded.pack.width,decoded.pack.height);gl.uniform1f(loc('uPolarWindScale'),decoded.pack.wind.scale);
  for(const [name,key] of [['uPolarLayerFlow','wind_multiplier'],['uPolarRadii','radius_ratio'],['uPolarThickness','thickness_ratio']])gl.uniform4fv(loc(name),decoded.pack.layers.map(l=>l[key]));
 },dispose(){for(const t of textures)gl.deleteTexture(t);}};
}
