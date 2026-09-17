let magic=null,config=null,currentStep=0,logs=[],fatal=null,frameCount=0;
function log(line){logs.push(String(line));if(logs.length>100)logs.shift();}
function fail(error){const message=error?.message||String(error)||'MagIC stopped unexpectedly.';postMessage({type:'error',message,log:logs.join('\n')});}
self.onmessage=async({data:d})=>{
 if(d.type==='pause'){if(magic)magic.paused=d.paused;postMessage({type:'paused',paused:Boolean(d.paused)});return;}
 if(d.type!=='start'||config)return;
 try{
  config=GasMagic.validate(d.config);
  magic=await createMagIC({wasmBinary:d.wasmBinary,noInitialRun:true,print:log,printErr:log,
   onAbort:reason=>{fatal=new Error('MagIC stopped: '+reason);},
   onStep:step=>{currentStep=step;postMessage({type:'progress',step:Math.min(step-1,config.steps),total:config.steps});},
   onGraph:()=>{
    for(const name of magic.FS.readdir('/').filter(n=>/^G_\d+\.browser$/.test(n))){
     try{
      const frame=GasMagic.parseGraph(magic.FS.readFile('/'+name));
      frame.step=Math.min(magic.currentStep-1,config.steps);
      frameCount++;
      postMessage({type:'frame',frame},[frame.fields.buffer,frame.theta.buffer,frame.radii.buffer]);
     }catch(error){fatal=error;throw error;}finally{magic.FS.unlink('/'+name);}
    }
   }});
  magic.FS.writeFile('/input.nml',GasMagic.namelist(config));
  postMessage({type:'ready'});
  await magic.ccall('browser_run',null,[],[],{async:true});
  if(fatal)throw fatal;
  if(!frameCount)throw new Error('MagIC finished without any field output. Reset and try again.');
  if(!logs.some(line=>line.includes('regular end of program MagIC')))throw new Error('MagIC ended before completing the run. '+logs.slice(-4).join(' '));
  postMessage({type:'complete',log:logs.join('\n')});
 }catch(error){fail(fatal||error);}
};
