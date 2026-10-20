import {generateAirless,createAirlessModel} from './airless-model.js';
import {cubeFaces,faceDirection} from './planet-tool/cubemap.js';
self.onmessage=({data})=>{
 try{
  if(data.type==='cube'){
   const model=createAirlessModel(data.settings),size=data.settings.resolution,faces={};
   for(const face of cubeFaces){const a=new Float32Array(size*size);for(let y=0;y<size;y++)for(let x=0;x<size;x++)a[y*size+x]=model.sample(...faceDirection(face,x/(size-1)*2-1,y/(size-1)*2-1));faces[face]=a;}
   self.postMessage({type:'cube',size,faces},Object.values(faces).map(a=>a.buffer));
  }else{const result=generateAirless(data.settings);self.postMessage({type:'terrain',...result},[result.heights.buffer]);}
 }catch(error){self.postMessage({type:'error',message:error.message});}
};
