// Polar storms explorer: the laboratory Ro/E regime relation for polygonal
// shear-layer vortices, rendered two ways — the workbench's Saturn-style
// cloud-band painter, and a dye-streak emulation of the tank experiments.
// Both views are prescribed kinematics (appearance models), not fluid
// solutions; see storm-regime.js for the provenance of the relation itself.

import {classifyPolarStorm,regimeFromWorld} from './storm-regime.js';
import {createCoordinates,paintClouds} from './saturn-model.js';

const TAU=2*Math.PI;
const STORM_NAMES={2:'ellipse',3:'triangle',4:'square',5:'pentagon',6:'hexagon',7:'heptagon',8:'octagon',9:'nonagon',10:'decagon'};

export function initPolarStormsTab(){
 const $=id=>document.getElementById(id);
 const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
 const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));

 // Regime state in log10 coordinates. The default is the Saturn north-jet
 // point (Ro ≈ 0.024, E ≈ 1.9e-5), which the relation maps to the hexagon.
 const LX0=-2.6,LX1=0,LY0=-6,LY1=-3;
 let logRo=-1.61,logE=-4.72,Ro=Math.pow(10,-1.61),E=Math.pow(10,-4.72),info=classifyPolarStorm(Ro,E);
 let view='dye',active=false,paused=!!reduced?.matches,time=0,raf=null,lastTime=0,lastPaint=0,dirty=true,drag=false;

 // --- Regime map (log-log; every boundary is a straight line here) ---
 const MW=560,MH=420,ML=66,MR=16,MT=14,MB=46;
 const X=l=>ML+(l-LX0)/(LX1-LX0)*(MW-ML-MR);
 const Y=l=>MT+(LY1-l)/(LY1-LY0)*(MH-MT-MB);
 const invX=x=>LX0+(x-ML)/(MW-ML-MR)*(LX1-LX0);
 const invY=y=>LY1-(y-MT)/(MH-MT-MB)*(LY1-LY0);
 const onsetX=lE=>Math.log10(27)+.72*lE;
 const bandX=(c,lE)=>Math.log10(c)+.72*lE;
 const chaosY=lRo=>-5+1.4*(lRo-Math.log10(.18));
 const sup=n=>String(n).replace(/-/g,'⁻').replace(/\d/g,d=>'⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]);
 const pow10=l=>l===0?'1':'10'+sup(l);
 const svg=$('storms-map');

 function buildMap(){
  let s='<defs><clipPath id="storms-clip"><rect x="'+ML+'" y="'+MT+'" width="'+(MW-ML-MR)+'" height="'+(MH-MT-MB)+'"/></clipPath></defs>';
  for(let l=-2.5;l<=LX1;l+=.5)s+='<line class="storms-grid" x1="'+X(l)+'" y1="'+MT+'" x2="'+X(l)+'" y2="'+(MH-MB)+'"/>';
  for(let l=LY0;l<=LY1;l++)s+='<line class="storms-grid" x1="'+ML+'" y1="'+Y(l)+'" x2="'+(MW-MR)+'" y2="'+Y(l)+'"/>';
  for(let l=-2;l<=0;l++)s+='<text class="storms-tick" x="'+X(l)+'" y="'+(MH-MB+18)+'" text-anchor="middle">'+pow10(l)+'</text>';
  for(let l=LY0;l<=LY1;l++)s+='<text class="storms-tick" x="'+(ML-8)+'" y="'+(Y(l)+4)+'" text-anchor="end">'+pow10(l)+'</text>';
  s+='<text class="storms-axis-label" x="'+((ML+MW-MR)/2)+'" y="'+(MH-8)+'" text-anchor="middle">Rossby number · Ro = U/(fL)</text>';
  s+='<text class="storms-axis-label" transform="rotate(-90 16 '+((MT+MH-MB)/2)+')" x="16" y="'+((MT+MH-MB)/2)+'" text-anchor="middle">Ekman number · E = ν/(fL²)</text>';
  s+='<g clip-path="url(#storms-clip)">';
  s+='<line class="storms-onset" x1="'+X(onsetX(LY0))+'" y1="'+Y(LY0)+'" x2="'+X(onsetX(LY1))+'" y2="'+Y(LY1)+'"/>';
  for(const c of [65,130,260])s+='<line class="storms-band-line" x1="'+X(bandX(c,LY0))+'" y1="'+Y(LY0)+'" x2="'+X(bandX(c,LY1))+'" y2="'+Y(LY1)+'"/>';
  s+='<line class="storms-chaos" x1="'+X(Math.log10(.18))+'" y1="'+Y(-5)+'" x2="'+X(LX1)+'" y2="'+Y(chaosY(LX1))+'"/>';
  s+='<rect class="storms-covered" x="'+X(-2)+'" y="'+Y(-3)+'" width="'+(X(0)-X(-2))+'" height="'+(Y(-5)-Y(-3))+'"/>';
  const zone=(lRo,lE,text)=>'<text class="storms-zone" x="'+X(lRo)+'" y="'+Y(lE)+'" text-anchor="middle">'+text+'</text>';
  s+=zone(-2.32,-4.75,'stable')+zone(-1.40,-4.2,'m = 6–8')+zone(-0.81,-3.85,'m = 4–5')+zone(-0.72,-4.2,'m = 3')+zone(-0.26,-4.0,'m = 2')+zone(-0.22,-5.4,'chaotic');
  s+='<text class="storms-covered-label" x="'+X(-1)+'" y="'+Y(-3.3)+'" text-anchor="middle">tank experiments</text>';
  s+='</g><rect class="storms-frame" x="'+ML+'" y="'+MT+'" width="'+(MW-ML-MR)+'" height="'+(MH-MT-MB)+'"/>';
  s+='<g id="storms-marker" tabindex="0"><circle class="storms-marker-halo" r="16"/><circle class="storms-marker-dot" r="9"/></g>';
  svg.innerHTML=s;
 }
 buildMap();
 const marker=svg.querySelector('#storms-marker');

 // --- Polar views ---
 const pole=$('storms-pole'),pctx=pole.getContext('2d');
 const pImage=pctx.createImageData(288,288),pCoords=createCoordinates(288,288,'north',26);
 function paintBands(){
  const sides=info.regime==='stable'?0:info.regime==='chaotic'?3:info.m;
  const wave=info.regime==='chaotic'?1+.55*Math.sin(time*.7)+.25*Math.sin(time*1.9):1;
  paintClouds(pImage,pCoords,time,{wave,detail:1,sidesNorth:sides,sidesSouth:10});
  pctx.putImageData(pImage,0,0);
 }

 // Dye-streak emulation: a counter-rotating shear layer (zero velocity at the
 // jet radius R0) carries a prescribed m-fold wave; tracers are advected
 // kinematically, like dye in the tank. Not a fluid solution.
 const CX=144,CY=144,R0=100,SIG=33,DEL=25,NP=650;
 let trailLength=48,dyeColor='theme';
 let phase=0,frame=0;
 const gauss=()=>Math.sqrt(-2*Math.log(Math.random()||1e-9))*Math.cos(TAU*Math.random());
 const parts=Array.from({length:NP},()=>({x:0,y:0,speed:0,trail:[]}));
 function seed(p){
  const phi=Math.random()*TAU,r=Math.random()<.7?R0+SIG*gauss():138*Math.sqrt(Math.random());
  p.x=CX+r*Math.cos(phi);p.y=CY+r*Math.sin(phi);p.speed=0;p.trail.length=0;
 }
 for(const p of parts)seed(p);
 function stepDye(dt){
  const m=info.regime==='polygon'?info.m:3;
  const Os=.45+.55*Math.min(1,Ro),Op=.12*Os;
  phase+=Op*dt;frame++;
  const A0=.55*Os*R0*SIG*SIG/(4*DEL);
  let A=0;
  if(info.regime==='chaotic')A=A0*(.7+.45*Math.sin(1.7*time)+.25*Math.sin(3.1*time+1));
  else if(info.regime==='polygon'){const excess=Ro/(27*Math.pow(E,.72));A=A0*Math.min(1.5,Math.max(.35,.4+.3*(excess-1)));}
  const record=frame%2===0;
  for(const p of parts){
   const dx=p.x-CX,dy=p.y-CY,r=Math.max(.001,Math.hypot(dx,dy)),phi=Math.atan2(dy,dx);
   const x2=(r-R0)/SIG,g=Math.exp(-x2*x2),a=m*(phi-phase);
   const vr=-A*g*m*Math.sin(a)/Math.max(r,10);
   const vt=r*Os*(-Math.tanh((r-R0)/DEL))+A*g*2*(r-R0)/(SIG*SIG)*Math.cos(a);
   const vx=vr*Math.cos(phi)-vt*Math.sin(phi),vy=vr*Math.sin(phi)+vt*Math.cos(phi);
   p.x+=vx*dt;p.y+=vy*dt;p.speed=Math.hypot(vx,vy);
   const rr=Math.hypot(p.x-CX,p.y-CY);
   if(rr>139||rr<5)seed(p);
   else if(record){p.trail.push(p.x,p.y);if(p.trail.length>trailLength*2)p.trail.splice(0,2);}
  }
 }
 const mix=(a,b,t)=>a+(b-a)*t;
 function heatColor(t){
  t=clamp(t,0,1);
  const stops=[[48,18,59],[128,44,140],[226,75,83],[255,190,74],[255,245,170]],p=t*(stops.length-1),i=Math.min(stops.length-2,Math.floor(p)),f=p-i;
  return stops[i].map((v,k)=>Math.round(mix(v,stops[i+1][k],f)));
 }
 function streakColor(p){
  if(dyeColor==='theme')return [168,96,255];
  const dx=p.x-CX,dy=p.y-CY,r=Math.hypot(dx,dy);
  if(dyeColor==='heatmap')return heatColor(p.speed/70);
  const hue=dyeColor==='radius'?clamp((r-35)/105,0,1)*280:(Math.atan2(dy,dx)/TAU+1)%1*360;
  const h=hue/60,c=.9,x=c*(1-Math.abs(h%2-1));let rgb=h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x];
  return rgb.map(v=>Math.round((v+.08)*236));
 }
 function drawDye(){
  pctx.fillStyle='rgb(9,16,29)';pctx.fillRect(0,0,288,288);
  pctx.lineWidth=1;
  pctx.beginPath();pctx.arc(CX,CY,140,0,TAU);pctx.strokeStyle='rgba(148,180,220,.14)';pctx.stroke();
  pctx.beginPath();pctx.arc(CX,CY,R0,0,TAU);pctx.strokeStyle='rgba(148,180,220,.08)';pctx.stroke();
  if(info.regime==='polygon'){
   pctx.beginPath();
   for(let k=0;k<=info.m;k++){const a=phase+k*TAU/info.m,px=CX+R0*Math.cos(a),py=CY+R0*Math.sin(a);k?pctx.lineTo(px,py):pctx.moveTo(px,py);}
   pctx.setLineDash([3,5]);pctx.strokeStyle='rgba(200,220,255,.16)';pctx.stroke();pctx.setLineDash([]);
  }
  pctx.lineWidth=1.3;pctx.lineCap='round';pctx.lineJoin='round';
  for(const p of parts){
   const t=p.trail,n=t.length/2;
   if(n<2)continue;
   const color=streakColor(p),rgb=color.join(',');
   const mid=Math.max(1,Math.floor(n/2));
   pctx.strokeStyle='rgba('+rgb+',.10)';
   pctx.beginPath();pctx.moveTo(t[0],t[1]);for(let i=1;i<mid;i++)pctx.lineTo(t[2*i],t[2*i+1]);pctx.stroke();
   pctx.strokeStyle='rgba('+rgb+',.52)';
   pctx.beginPath();pctx.moveTo(t[2*mid-2],t[2*mid-1]);for(let i=mid;i<n;i++)pctx.lineTo(t[2*i],t[2*i+1]);pctx.stroke();
  }
 }

 function status(){
  $('storms-state').textContent=paused?'Paused':'Animating';
  $('storms-pause').textContent=paused?'Resume animation':'Pause animation';
 }
 function sync(){
  logRo=clamp(logRo,LX0,LX1);logE=clamp(logE,LY0,LY1);
  Ro=Math.pow(10,logRo);E=Math.pow(10,logE);info=classifyPolarStorm(Ro,E);
  $('storms-ro').value=logRo.toFixed(2);$('storms-ro-value').textContent=logRo.toFixed(2);
  $('storms-e').value=logE.toFixed(2);$('storms-e-value').textContent=logE.toFixed(2);
  marker.setAttribute('transform','translate('+X(logRo).toFixed(1)+' '+Y(logE).toFixed(1)+')');
  const roText=Ro<.01?Ro.toExponential(2):Ro.toFixed(3),eText=E.toExponential(1);
  marker.setAttribute('aria-label','Regime point: Rossby number '+roText+', Ekman number '+eText+'. Arrow keys adjust; drag also works.');
  $('storms-ro-readout').textContent=roText;
  $('storms-e-readout').textContent=eText;
  $('storms-m-readout').textContent=info.regime==='polygon'?'m = '+info.m:'—';
  const name=info.regime==='polygon'?STORM_NAMES[info.m]:null;
  const desc=info.regime==='polygon'?name+' · m = '+info.m:info.regime==='stable'?'stable · axisymmetric jet':'chaotic · irregular meander';
  $('storms-caption').textContent='North polar view · '+desc+(info.extrapolated?' · extrapolated':'');
  pole.setAttribute('aria-label','North polar storm appearance: '+desc+(info.extrapolated?', extrapolated beyond the tank experiments.':'.'));
  $('storms-readout').textContent='Ro '+Ro.toPrecision(2)+' · E '+eText+' → '+(info.regime==='polygon'?'polygonal vortex: '+name+' (m = '+info.m+')':info.regime==='stable'?'stable vortex: no polygon (below onset Ro = 27·E^0.72)':'chaotic vortex: irregular meander')+(info.extrapolated?' · extrapolated':'');
  const warning=$('storms-warning');
  warning.hidden=!(info.extrapolated||info.regime==='chaotic');
  warning.textContent=info.extrapolated?'E < 10⁻⁵ lies beyond the tank experiments; the wavenumber there assumes the m ∝ E^(−1/4) layer-thinning trend persists.':info.regime==='chaotic'?'Chaotic regime: drawn as an irregular m = 3 meander — an appearance stand-in, not a predicted structure.':'';
  dirty=true;schedule();
 }

 // --- Animation ---
 function tick(now){
  raf=null;if(!active||document.hidden)return;
  const dt=Math.min(.08,(now-(lastTime||now))/1000);lastTime=now;
  let drew=false;
  if(!paused){
   time+=dt;
   if(view==='dye'){stepDye(dt);drawDye();drew=true;}
   else if(now-lastPaint>110){paintBands();lastPaint=now;drew=true;}
  }
  if(dirty&&!drew){if(view==='dye')drawDye();else{paintBands();lastPaint=now;}}
  dirty=false;
  if(!paused)schedule();
 }
 function schedule(){if(!raf&&active&&!document.hidden)raf=requestAnimationFrame(tick);}
 function stop(){if(raf)cancelAnimationFrame(raf);raf=null;lastTime=0;}

 // --- Controls ---
 $('storms-ro').oninput=()=>{logRo=Number($('storms-ro').value);sync();};
 $('storms-e').oninput=()=>{logE=Number($('storms-e').value);sync();};
 function place(e){
  const r=svg.getBoundingClientRect();
  const px=(e.clientX-r.left)*MW/r.width,py=(e.clientY-r.top)*MH/r.height;
  if(px<ML-24||px>MW-MR+24||py<MT-24||py>MH-MB+24)return;
  logRo=clamp(invX(px),LX0,LX1);logE=clamp(invY(py),LY0,LY1);sync();
 }
 svg.addEventListener('pointerdown',e=>{drag=true;svg.setPointerCapture(e.pointerId);place(e);e.preventDefault();});
 svg.addEventListener('pointermove',e=>{if(drag)place(e);});
 for(const t of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(t,()=>{drag=false;});
 marker.addEventListener('keydown',e=>{
  const step=e.shiftKey?.1:.02;
  if(e.key==='ArrowLeft')logRo-=step;else if(e.key==='ArrowRight')logRo+=step;
  else if(e.key==='ArrowUp')logE+=step;else if(e.key==='ArrowDown')logE-=step;
  else return;
  e.preventDefault();sync();
 });
 function setView(v){
  view=v;
  $('storms-view-bands').setAttribute('aria-pressed',String(v==='bands'));
  $('storms-view-dye').setAttribute('aria-pressed',String(v==='dye'));
  $('storms-dye-controls').hidden=v!=='dye';
  $('storms-note').textContent=v==='dye'?'Dye-streak emulation of the tank experiments: a counter-rotating shear layer (the flow inside the jet radius moves against the flow outside) carries a prescribed m-fold wave. Tracers are advected kinematically — this is not a fluid simulation.':'Cloud-band appearance from the workbench’s Saturn painter, with the polar jet wavenumber set by the regime relation. Colors are illustrative.';
  dirty=true;schedule();
 }
 $('storms-view-bands').onclick=()=>setView('bands');
 $('storms-view-dye').onclick=()=>setView('dye');
 $('storms-dye-color').onchange=()=>{dyeColor=$('storms-dye-color').value;dirty=true;schedule();};
 $('storms-trail-length').oninput=()=>{
  trailLength=Number($('storms-trail-length').value);$('storms-trail-value').textContent=trailLength;
  for(const p of parts)if(p.trail.length>trailLength*2)p.trail.splice(0,p.trail.length-trailLength*2);
  dirty=true;schedule();
 };
 $('storms-pause').onclick=()=>{paused=!paused;status();lastTime=0;schedule();};
 const num=id=>Number($(id).value);
 function applyWorld(){
  const r=regimeFromWorld({rotationHours:num('storms-rotation'),planetRadius:num('storms-radius')*1000,jetSpeed:num('storms-jet'),jetRadiusDeg:num('storms-jet-radius'),eddyViscosity:Math.pow(10,num('storms-eddy'))});
  if(!(r.Ro>0&&r.E>0))return;
  logRo=Math.log10(r.Ro);logE=Math.log10(r.E);sync();
 }
 $('storms-apply').onclick=applyWorld;
 $('storms-saturn').onclick=()=>{
  $('storms-rotation').value='10.7';$('storms-radius').value='60330';$('storms-jet').value='100';$('storms-jet-radius').value='12';$('storms-eddy').value='6';
  applyWorld();
 };
 document.addEventListener('visibilitychange',()=>{stop();schedule();});
 window.addEventListener('pagehide',stop);

 sync();setView('dye');status();
 return {setActive(on){active=on;stop();if(on){dirty=true;schedule();}},get active(){return active;}};
}
