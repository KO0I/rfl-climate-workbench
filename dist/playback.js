// A bounded, time-ordered replay shared by both views. Keep the first frame,
// latest frame, and a progressively coarser set of intermediate snapshots.
export class Playback {
 constructor(limit=480){this.limit=limit;this.reset();}
 reset(){this.frames=[];this.index=-1;this.playing=false;this.replaying=false;this.stride=1;this.count=0;this.tail=null;}
 push(frame){
  if(this.tail?.steps===frame.steps){if(this.frames.at(-1)===this.tail)this.frames[this.frames.length-1]=frame;this.tail=frame;return;}
  this.count++;this.tail=frame;
  if(this.count%this.stride===0||!this.frames.length)this.frames.push(frame);
  if(this.frames.length>this.limit){this.frames=this.frames.filter((_,i)=>i===0||i%2===1);this.stride*=2;}
  if(!this.replaying)this.index=this.all.length-1;
 }
 get all(){return !this.tail?this.frames:this.frames.at(-1)===this.tail?this.frames:[...this.frames,this.tail];}
 get current(){return this.replaying?this.all[Math.max(0,Math.min(this.index,this.all.length-1))]:this.tail;}
 seek(index){this.index=Math.max(0,Math.min(Math.round(index),this.all.length-1));this.replaying=true;this.playing=false;return this.current;}
 play(){if(!this.all.length)return;if(!this.replaying||this.index>=this.all.length-1)this.index=0;this.replaying=true;this.playing=true;}
 tick(){if(!this.playing)return false;if(this.index<this.all.length-1){this.index++;return true;}this.playing=false;return false;}
 live(){this.playing=false;this.replaying=false;this.index=this.all.length-1;}
}
