import {cloudIndex,CLOUD_RADIUS} from './clouds.js';
// Ground and clouds use separate sphere intersections. Physical fields stay
// unshaded and never receive the decorative cloud overlay.
export class Globe {
 constructor(canvas){
  this.canvas=canvas;this.ctx=canvas.getContext('2d');this.yaw=0;this.pitch=.15;this.drag=null;this.setSize(256);
  canvas.addEventListener('pointerdown',e=>{this.drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!this.drag)return;this.yaw+=(e.clientX-this.drag.x)*.009;this.pitch=Math.max(-1.4,Math.min(1.4,this.pitch+(e.clientY-this.drag.y)*.009));this.drag={x:e.clientX,y:e.clientY};this.onchange?.();});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{this.drag=null;});
  canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')this.yaw-=.15;if(e.key==='ArrowRight')this.yaw+=.15;if(e.key==='ArrowUp')this.pitch-=.1;if(e.key==='ArrowDown')this.pitch+=.1;this.pitch=Math.max(-1.4,Math.min(1.4,this.pitch));this.onchange?.();});
 }
 setSize(size){
  if(this.size===size)return;
  this.size=size;this.canvas.width=this.canvas.height=size;this.image=this.ctx.createImageData(size,size);
  this.radius=size*.4;
  this.surfaceZ=new Float32Array(size*size).fill(-1);this.cloudZ=new Float32Array(size*size).fill(-1);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const nx=(x+.5-size/2)/this.radius,ny=(size/2-y-.5)/this.radius,r2=nx*nx+ny*ny,i=y*size+x;
   if(r2<=1)this.surfaceZ[i]=Math.sqrt(1-r2);
   if(r2<=CLOUD_RADIUS*CLOUD_RADIUS)this.cloudZ[i]=Math.sqrt(1-r2/(CLOUD_RADIUS*CLOUD_RADIUS));
  }
 }
 draw(texture,scientific=false,clouds=null,palette=[]){
  const out=this.image.data,w=texture.width,h=texture.height,src=texture.data,cy=Math.cos(this.yaw),sy=Math.sin(this.yaw),cp=Math.cos(this.pitch),sp=Math.sin(this.pitch),size=this.size;
  const cloudColors=palette.slice(15).map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)));
  for(let py=0;py<size;py++)for(let px=0;px<size;px++){
   const index=py*size+px,i=index*4,nx=(px+.5-size/2)/this.radius,ny=(size/2-py-.5)/this.radius;
   out[i]=10;out[i+1]=18;out[i+2]=33;out[i+3]=255;
   const nz=this.surfaceZ[index];
   if(nz>=0){
    const y=cp*ny-sp*nz,z=sp*ny+cp*nz,x=cy*nx+sy*z,zz=-sy*nx+cy*z;
    const lon=Math.atan2(x,zz),lat=Math.asin(Math.max(-1,Math.min(1,y))),u=((Math.floor((lon+Math.PI)/(2*Math.PI)*w)%w)+w)%w,v=Math.min(h-1,Math.max(0,Math.floor((Math.PI/2-lat)/Math.PI*h))),j=(v*w+u)*4;
    const shade=scientific?1:.36+.64*Math.max(0,(-.35*nx+.45*ny+.82*nz)/1.003);
    out[i]=src[j]*shade;out[i+1]=src[j+1]*shade;out[i+2]=src[j+2]*shade;
   }
   const cz=this.cloudZ[index];
   if(!scientific&&clouds&&cz>=0){
    const cx=nx/CLOUD_RADIUS,cn=ny/CLOUD_RADIUS,y=cp*cn-sp*cz,z=sp*cn+cp*cz,x=cy*cx+sy*z,zz=-sy*cx+cy*z;
    const j=cloudIndex(clouds,Math.atan2(x,zz),Math.asin(Math.max(-1,Math.min(1,y)))),alpha=clouds.alpha[j];
    if(alpha>0){
     const rgb=cloudColors[clouds.shades[j]],shade=.36+.64*Math.max(0,(-.35*cx+.45*cn+.82*cz)/1.003);
     for(let k=0;k<3;k++)out[i+k]+=(rgb[k]*shade-out[i+k])*alpha;
    }
   }
  }
  this.ctx.putImageData(this.image,0,0);
 }
}
