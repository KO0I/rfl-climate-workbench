// Standard cube directions. Adjacent face edges address identical world points.
export const cubeFaces=['px','nx','py','ny','pz','nz'];
export const cubeNames={px:'+X · east',nx:'−X · west',py:'+Y · north',ny:'−Y · south',pz:'+Z · front',nz:'−Z · back'};
export function faceDirection(face,u,v){
 const p=face==='px'?[1,-v,-u]:face==='nx'?[-1,-v,u]:face==='py'?[u,1,v]:face==='ny'?[u,-1,-v]:face==='pz'?[u,-v,1]:face==='nz'?[-u,-v,-1]:null;
 if(!p)throw new Error('Unknown cube face.');const length=Math.hypot(...p);return p.map(x=>x/length);
}
export function directionToUV([x,y,z]){return [((Math.atan2(x,z)/(2*Math.PI)+.5)%1+1)%1,.5-Math.asin(Math.max(-1,Math.min(1,y)))/Math.PI];}
const tables=new Map();
export function cubeLookup(face,size,width,height){
 const key=[face,size,width,height].join(':');if(tables.has(key))return tables.get(key);
 const lookup=new Uint32Array(size*size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const [u,v]=directionToUV(faceDirection(face,x/(size-1)*2-1,y/(size-1)*2-1));
  lookup[y*size+x]=(Math.min(height-1,Math.floor(v*height))*width+Math.min(width-1,Math.floor(u*width)))*4;
 }
 tables.set(key,lookup);return lookup;
}
export function cubePixels(texture,face,size=256){
 const lookup=cubeLookup(face,size,texture.width,texture.height),out=new Uint8ClampedArray(size*size*4);
 for(let i=0;i<lookup.length;i++){const j=lookup[i];out[i*4]=texture.data[j];out[i*4+1]=texture.data[j+1];out[i*4+2]=texture.data[j+2];out[i*4+3]=255;}
 return out;
}
export function drawCubeMap(canvas,texture,projection='cube',size=256){
 const all=projection==='cube',width=all?size*4:size,height=all?size*3:size;
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
 canvas.parentElement.style.aspectRatio=all?'4 / 3':'1';
 const ctx=canvas.getContext('2d');ctx.fillStyle='#0a1221';ctx.fillRect(0,0,width,height);
 const positions=all?[['nx',0,1],['pz',1,1],['px',2,1],['nz',3,1],['py',1,0],['ny',1,2]]:[[projection,0,0]];
 const font=Math.max(14,Math.round(14*width/(canvas.clientWidth||width)));
 for(const [face,col,row] of positions){const image=ctx.createImageData(size,size);image.data.set(cubePixels(texture,face,size));ctx.putImageData(image,col*size,row*size);ctx.strokeStyle='#91a7bd';ctx.lineWidth=1;ctx.strokeRect(col*size+.5,row*size+.5,size-1,size-1);if(all){ctx.fillStyle='#0a1221df';ctx.fillRect(col*size+7,row*size+7,font*2.5,font*1.7);ctx.fillStyle='#e3edf9';ctx.font=font+'px system-ui';ctx.fillText(cubeNames[face].split(' · ')[0],col*size+14,row*size+font*1.4);}}
}
