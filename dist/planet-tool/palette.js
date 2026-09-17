import {frameToBmp,frameToXpm,validatePaletteBmp} from './formats.mjs';
export function palettePixels(colors){const pixels=new Uint8Array(80);colors.forEach((hex,i)=>{pixels.set(hex.slice(1).match(/../g).map(v=>parseInt(v,16)),i*4);pixels[i*4+3]=255;});return pixels;}
export const paletteBmp=colors=>frameToBmp(palettePixels(colors),5,4);
export const paletteXpm=colors=>frameToXpm(palettePixels(colors),5,4).replace('RFL planet tool frame','RFL palette: land, coast, liquid, clouds; five shades per row');
export function readPaletteBmp(bytes){
 validatePaletteBmp(bytes,5,4);const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),offset=view.getUint32(10,true),height=view.getInt32(22,true),bpp=view.getUint16(28,true)/8,stride=(5*bpp+3)&~3;
 return Array.from({length:20},(_,i)=>{const y=Math.floor(i/5),p=offset+(height>0?3-y:y)*stride+i%5*bpp;return '#'+[bytes[p+2],bytes[p+1],bytes[p]].map(v=>v.toString(16).padStart(2,'0')).join('');});
}
export function readPaletteXpm(text){
 if(text.length>65536)throw new Error('Choose a 5 × 4 XPM palette.');
 let lines=text.trimStart().startsWith('! XPM2')?text.split(/\r?\n/).filter(line=>line&&!line.startsWith('!')):[...text.matchAll(/"([^"\r\n]*)"/g)].map(m=>m[1]);
 const [w,h,count,cpp]=lines.shift()?.trim().split(/\s+/).map(Number)||[];
 if(w!==5||h!==4||count<1||count>20||cpp<1||cpp>4||lines.length!==count+h)throw new Error('Choose a 5 × 4 XPM2 or C XPM palette with opaque hex colors.');
 const colors=new Map();
 for(const line of lines.splice(0,count)){const hex=line.slice(cpp).trim().match(/^c\s+(#[0-9a-f]{6})$/i);if(!hex||colors.has(line.slice(0,cpp)))throw new Error('Palette colors must use unique keys and #RRGGBB colors.');colors.set(line.slice(0,cpp),hex[1].toLowerCase());}
 return lines.flatMap(line=>{if(line.length!==w*cpp)throw new Error('Invalid XPM row length.');return Array.from({length:5},(_,x)=>{const c=colors.get(line.slice(x*cpp,(x+1)*cpp));if(!c)throw new Error('Unknown XPM color.');return c;});});
}

export function readPalettePixels(pixels,width,height){
 if(width!==5||height!==4||pixels.length!==80)throw new Error('The palette sprite must be exactly 5 × 4 pixels.');
 return Array.from({length:20},(_,i)=>{
  if(pixels[i*4+3]!==255)throw new Error('Palette pixels must be opaque.');
  return '#'+Array.from(pixels.slice(i*4,i*4+3),v=>v.toString(16).padStart(2,'0')).join('');
 });
}

export async function readPaletteFile(file){
 if(file.size>65536)throw new Error('Choose a small 5 × 4 PNG, BMP or XPM palette.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(bytes[0]===66&&bytes[1]===77)return readPaletteBmp(bytes);
 if(bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)return readPaletteXpm(new TextDecoder().decode(bytes));
 // Check dimensions before asking the browser to decode the image.
 if(bytes.length<33)throw new Error('The PNG palette is incomplete.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(view.getUint32(16)!==5||view.getUint32(20)!==4)throw new Error('The palette sprite must be exactly 5 × 4 pixels.');
 const blob=new Blob([bytes],{type:'image/png'});
 let image,url;
 try{
  if(typeof createImageBitmap==='function')image=await createImageBitmap(blob,{premultiplyAlpha:'none',colorSpaceConversion:'none'});
  else{
   image=new Image();url=URL.createObjectURL(blob);
   await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('The PNG palette could not be opened.'));image.src=url;});
  }
  if(image.width!==5||image.height!==4)throw new Error('The palette sprite must be exactly 5 × 4 pixels.');
  const canvas=document.createElement('canvas');canvas.width=5;canvas.height=4;
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  return readPalettePixels(ctx.getImageData(0,0,5,4).data,5,4);
 }finally{image?.close?.();if(url)URL.revokeObjectURL(url);}
}
