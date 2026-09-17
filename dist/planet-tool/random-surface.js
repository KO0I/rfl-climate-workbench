// Five ordered shades per material keep terrain readable with any chosen hue.
function hex(h,s,l){
 const a=s*Math.min(l,1-l),channel=n=>{
  const k=(n+h/30)%12;
  return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0');
 };
 return '#'+channel(0)+channel(8)+channel(4);
}
export function randomSurface(current,rng=Math.random){
 const landHue=rng()*360,liquidHue=(landHue+90+rng()*180)%360;
 const rows=[
  [landHue,.25+rng()*.4,[.10,.20,.31,.43,.59]],
  [(landHue+15+rng()*40)%360,.25+rng()*.3,[.28,.38,.49,.61,.75]],
  [liquidHue,.4+rng()*.4,[.07,.13,.22,.33,.48]],
  [liquidHue,.03+rng()*.09,[.46,.62,.78,.90,.97]],
 ];
 return {
  settings:{...current,seed:(current.seed+1+Math.floor(rng()*4294967295))%4294967296,
   sea:Math.round((.38+rng()*.14)*100)/100,frequency:Math.round((1.5+rng()*3)*10)/10,
   relief:(5+Math.floor(rng()*36))*100},
  palette:rows.flatMap(([h,s,shades])=>shades.map(l=>hex(h,s,l))),
 };
}
