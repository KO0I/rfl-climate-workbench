// Shared by the page, the isolated solver worker, and numerical checks.
// MagIC source 0d408831fd38ac72c52d53dd091a3ccaabce5207, serial double precision.
(function(root){
 'use strict';
 const grids={128:17,192:25};
 const defaults={ra:150000,ek:0.001,pr:1,strat:3,radratio:0.6,steps:1000,resolution:128,perturbation:0.1};
 const limits={ra:[10000,2000000],ek:[0.0003,0.01],pr:[0.3,3],strat:[0,5],radratio:[0.35,0.8],steps:[100,10000],perturbation:[0.01,1]};
 function validate(input){
  const c={...defaults,...input};
  for(const [key,[lo,hi]] of Object.entries(limits))if(!Number.isFinite(c[key])||c[key]<lo||c[key]>hi)throw new Error(`${key} must be between ${lo} and ${hi}.`);
  if(!Number.isInteger(c.steps)||!Number.isInteger(c.resolution)||!Object.hasOwn(grids,c.resolution))throw new Error('Choose a supported resolution and a whole number of steps.');
  return Object.fromEntries(Object.keys(defaults).map(k=>[k,c[k]]));
 }
 function namelist(input){
  const c=validate(input),nr=grids[c.resolution];
  return `! MagIC serial gas-shell experiment. Dimensionless; exploratory resolution.
! Physics: nonmagnetic convection, polytropic background, stress-free boundaries.
&grid
 n_r_max=${nr}, n_cheb_max=${nr-2}, n_phi_tot=${c.resolution},
 n_r_ic_max=17, n_cheb_ic_max=15, minc=1,
/
&control
 mode=1, tag='browser', n_time_steps=${c.steps},
 dtmax=${Math.min(0.0001,c.ek*.08)}, courfac=2.5, alpha=0.6,
 time_scheme='CNAB2', n_tScale=0, n_lScale=0,
 l_correct_AMz=.true., l_correct_AMe=.true.,
/
&phys_param
 ra=${c.ra}, ek=${c.ek}, pr=${c.pr}, prmag=0,
 strat=${c.strat}, polind=2, radratio=${c.radratio},
 g0=0, g1=0, g2=1,
 ktops=1, kbots=1, ktopv=1, kbotv=1,
/
&start_field
 l_start_file=.false., init_s1=1919, amp_s1=${c.perturbation},
/
&output_control
 n_graphs=0, n_graph_step=${Math.max(10,Math.ceil(c.steps/24))}, n_log_step=${Math.max(20,Math.ceil(c.steps/24))},
 n_specs=0, n_rsts=0, n_stores=0, l_movie=.false.,
 l_RMS=.false., l_AM=.true., l_PressGraph=.false.,
 runid='Planet Lab gas shell',
/
&mantle
 nRotMa=0,
/
&inner_core
 sigma_ratio=0, nRotIC=0,
/
`;
 }
 function parseGraph(bytes){
  const a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),view=new DataView(a.buffer,a.byteOffset,a.byteLength);
  if(a.length<152)throw new Error('Incomplete MagIC graph header.');
  const le=view.getInt32(0,true)===14;
  if(view.getInt32(0,le)!==14)throw new Error('Expected a MagIC version-14 graph.');
  let pos=4;
  const runid=new TextDecoder().decode(a.subarray(pos,pos+64)).trim();pos+=64;
  const f=()=>{const v=view.getFloat32(pos,le);pos+=4;return v;};
  const i=()=>{const v=view.getInt32(pos,le);pos+=4;return v;};
  const time=f(),parameters={};
  for(const k of ['ra','pr','raxi','sc','ek','stef','prmag','radratio','sigma_ratio'])parameters[k]=f();
  const levels=i(),rows=i(),width=i(),minc=i(),innerLevels=i(),flags=Array.from({length:6},i);
  if(!Object.hasOwn(grids,width)||rows!==width/2||levels!==grids[width]||minc!==1||flags[0]!==1||flags.slice(1).some(Boolean))throw new Error('Unsupported MagIC grid or fields.');
  const expected=152+4*(rows+levels)+levels*width*rows*4*4;
  if(a.length!==expected)throw new Error(`Incomplete MagIC graph (${a.length} bytes; expected ${expected}).`);
  const theta=Float32Array.from({length:rows},f),radii=Float32Array.from({length:levels},f);
  const fields=new Float32Array(levels*4*width*rows);
  for(let n=0;n<fields.length;n++){const v=f();if(!Number.isFinite(v))throw new Error('MagIC produced a non-finite field. Reduce forcing or use finer resolution.');fields[n]=v;}
  if(!Number.isFinite(time)||time<0||theta.some((v,y)=>!Number.isFinite(v)||v<=0||v>=Math.PI||(y>0&&v<=theta[y-1]))||radii.some((v,z)=>!Number.isFinite(v)||v<=0||(z>0&&v>=radii[z-1])))throw new Error('Invalid MagIC coordinates.');
  return {model:'MagIC',revision:'0d408831fd38ac72c52d53dd091a3ccaabce5207',time,parameters,runid,width,rows,levels,theta,radii,fields};
 }
 function shell(frame,level){
  if(!Number.isInteger(level)||level<0||level>=frame.levels)throw new Error('Invalid shell depth.');
  const n=frame.width*frame.rows,start=level*n*4;
  const [radial,south,east,entropy]=[0,1,2,3].map(k=>frame.fields.subarray(start+k*n,start+(k+1)*n));
  let sum=0,weight=0;
  const weights=Array.from(frame.theta,t=>{
   const x=Math.cos(t),n=frame.rows;let p0=1,p1=x;
   for(let k=2;k<=n;k++){const p=((2*k-1)*x*p1-(k-1)*p0)/k;p0=p1;p1=p;}
   const derivative=n*(x*p1-p0)/(x*x-1);return 2/((1-x*x)*derivative*derivative);
  });
  for(let x=0;x<frame.width;x++)for(let y=0;y<frame.rows;y++){const w=weights[y];sum+=entropy[x*frame.rows+y]*w;weight+=w;}
  const mean=sum/weight;
  return {radial,south,east,entropy,mean,radius:frame.radii[level]/frame.radii[0]};
 }
 root.GasMagic={defaults,limits,validate,namelist,parseGraph,shell};
})(globalThis);
