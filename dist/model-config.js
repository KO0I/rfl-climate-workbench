(function (scope) {
  'use strict';
  function resolution(preset='low') {
    displayResolution(preset);
    return {preset:'low',longitude:64,latitude:32,cells:2048,truncation:21,levels:10,timestepMinutes:30,engine:'engine'};
  }
  function displayResolution(preset='low') {
    if(!['low','high'].includes(preset))throw new Error('Choose low or high resolution.');
    const high=preset==='high',latitude=high?64:32,longitude=latitude*2;
    return {preset,longitude,latitude,cells:longitude*latitude,scale:high?2:1};
  }
  function validate(c) {
    if(!c || typeof c!=="object" || Array.isArray(c))throw new Error("Expected a climate configuration.");
    if(Object.keys(c).some(k=>!["flux","co2","rotation","days"].includes(k)))throw new Error("Unknown configuration field.");
    if(![1,10,30,360].includes(c.days))throw new Error("Choose a run length of 1, 10, 30, or 360 days.");
    const limits = {flux:[800,1800],co2:[10,2000],rotation:[0.5,10],days:[1,360]};
    for(const [key,[lo,hi]] of Object.entries(limits)) {
      if(typeof c[key] !== 'number' || !Number.isFinite(c[key]) || c[key]<lo || c[key]>hi) throw new Error(`Invalid ${key}: expected ${lo}–${hi}.`);
    }
    return {...c};
  }
  function namelists(input,preset='low') {
    const c=validate(input),grid=resolution(preset),stepsPerDay=1440/grid.timestepMinutes;
    const year=Math.max(Math.floor(360/c.rotation/12+0.5),1)*12;
    return {
      plasim_namelist:`&plasim_nl\n NOUTPUT=0, NGUI=0, NPRINT=0, NDIAG=${stepsPerDay}, N_START_YEAR=1, N_DAYS_PER_YEAR=${year},\n N_RUN_YEARS=0, N_RUN_MONTHS=0, N_RUN_DAYS=0, N_RUN_STEPS=${360*stepsPerDay},\n MPSTEP=${grid.timestepMinutes}.0, KICK=0, NADV=1, NQSPEC=1, NVEG=0, NWPD=0, NLOWIO=1,\n NSNAPSHOT=0, NSTPS=${stepsPerDay}, NFILTER=0, NGPTFILTER=1, NSPVFILTER=1,\n PSURF=101100.0, NSYNC=0, L_AERO=0\n/\n`,
      planet_namelist:`&planet_nl\n NFIXORB=1, ECCEN=0.016715, OBLIQ=23.441, MVELP=102.7,\n GSOL0=${c.flux}, ROTSPD=${1/c.rotation}\n/\n`,
      radmod_namelist:`&radmod_nl\n CO2=${c.co2}, NDCYCLE=1\n/\n`
    };
  }
  scope.ExoConfig={validate,namelists,resolution,displayResolution};
})(globalThis);
