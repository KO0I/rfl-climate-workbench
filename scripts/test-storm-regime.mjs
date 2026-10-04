// Reference checks for the polar storm regime relation.
// Run: node scripts/test-storm-regime.mjs
import {classifyPolarStorm,regimeFromWorld} from '../dist/storm-regime.js';
import {polarBoundary} from '../dist/saturn-model.js';

let failures=0;
function check(name,cond){if(cond)console.log('ok   '+name);else{failures++;console.error('FAIL '+name);}}

const mid=classifyPolarStorm(0.2,1e-4);
check('Ro=0.2, E=1e-4 -> polygon m=3',mid.regime==='polygon'&&mid.m===3);

const stable=classifyPolarStorm(0.02,1e-3);
check('Ro=0.02, E=1e-3 -> stable (below onset 27E^0.72)',stable.regime==='stable');

const chaos=classifyPolarStorm(0.5,1e-5);
check('Ro=0.5, E=1e-5 -> chaotic',chaos.regime==='chaotic');

const deep=classifyPolarStorm(0.004,4e-6);
check('Ro=0.004, E=4e-6 -> extrapolated decagon',deep.regime==='polygon'&&deep.m===10&&deep.extrapolated);

const seven=classifyPolarStorm(0.05,1e-4);
check('Ro=0.05, E=1e-4 -> polygon m=7',seven.regime==='polygon'&&seven.m===7);

const far=classifyPolarStorm(0.9,1e-4);
check('Ro=0.9, E=1e-4 -> polygon m=2',far.regime==='polygon'&&far.m===2);

// Saturn-like north polar jet: 10.7 h rotation, R = 6.03e7 m, jet at 12 deg
// colatitude, 100 m/s, eddy viscosity 1e6 m2/s. Ro ~= 0.024, E ~= 1.9e-5,
// just past onset: the laboratory relation independently selects m = 6.
const saturn=regimeFromWorld({rotationHours:10.7,planetRadius:6.03e7,jetSpeed:100,jetRadiusDeg:12,eddyViscosity:1e6});
const hex=classifyPolarStorm(saturn.Ro,saturn.E);
check('Saturn-like north jet -> m=6 hexagon',hex.regime==='polygon'&&hex.m===6);

check('polarBoundary default north equals explicit m=6',polarBoundary(0.37,true,2.5,0.8)===polarBoundary(0.37,true,2.5,0.8,6));
check('polarBoundary default south equals explicit m=10',polarBoundary(0.37,false,2.5,0.8)===polarBoundary(0.37,false,2.5,0.8,10));
check('polarBoundary m<3 renders the axisymmetric limit',polarBoundary(0.37,true,2.5,0.8,0)===12&&polarBoundary(0.37,false,2.5,0.8,2)===28);
check('south boundary phase drifts with time',polarBoundary(0.1,false,1,1)!==polarBoundary(0.1,false,2,1));

// The dedicated Polar storms tab stays wired to the shared modules.
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
check('index.html has a Polar storms tab, panel and settings',html.includes('id="tab-storms"')&&html.includes('id="panel-storms"')&&html.includes('id="storms-settings"'));
const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
check('app.js wires the polar storms tab',app.includes("import {initPolarStormsTab} from './polar-storms.js';")&&app.includes("stormsTab.setActive(name==='storms')"));
const explorer=readFileSync(new URL('../dist/polar-storms.js',import.meta.url),'utf8');
check('polar-storms.js reuses the shared regime relation and painter',explorer.includes("from './storm-regime.js'")&&explorer.includes("from './saturn-model.js'"));

process.exitCode=failures?1:0;
console.log(failures?failures+' failure(s)':'all checks passed');
