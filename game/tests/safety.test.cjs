const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),elements=new Map(),storage=new Map();
function element(id){if(!elements.has(id)){const classes=new Set();elements.set(id,{id,value:'',textContent:'',innerHTML:'',style:{},dataset:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,on){if(on??!classes.has(x))classes.add(x);else classes.delete(x)}},addEventListener(){},focus(){},querySelector(){return null},getContext(){return new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)})}})}return elements.get(id)}
const context=vm.createContext({console,Math,Date,JSON,Map,Set,Promise,crypto:require('node:crypto').webcrypto,performance:{now:()=>0},innerWidth:390,innerHeight:844,devicePixelRatio:1,navigator:{},Image:class{},window:{addEventListener(){}},document:{getElementById:element,addEventListener(){},querySelectorAll:()=>[],documentElement:{}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},addEventListener(){},requestAnimationFrame(){},setTimeout,clearTimeout});
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),scripts=[...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
vm.runInContext(scripts.find(s=>s.includes("'use strict'")),context);vm.runInContext(fs.readFileSync(path.join(root,'story-trip.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(root,'safety.js'),'utf8'),context);vm.runInContext('loadProfile();resize();menu();cloudStartRound=()=>{};',context);
const run=s=>vm.runInContext(s,context),test=(name,fn)=>{fn();console.log('PASS',name)};
function fresh(){run("sessionType='free';reset(false);mode='play';events=[];cars=[];nextEvent=1e9;nextTraffic=1e9;nextAmbulance=1e9;")}
test('continuous lanes across narrowing',()=>{fresh();assert(run(`(()=>{let max=0;for(let d=0;d<12000;d+=.5)max=Math.max(max,Math.abs(laneX(d,'same',0)-laneX(d+.5,'same',0)));return max<1})()`))});
test('traffic never moves backwards to resolve spacing',()=>{fresh();assert(run(`(()=>{cars=[makeTraffic(800,'same',0,{actualV:80}),makeTraffic(780,'same',0,{actualV:80})];const old=cars.map(c=>c.d);updateTraffic(.016,playerD());return cars.every((c,i)=>c.d>=old[i])})()`))});
test('ambulance keeps actors and moves continuously',()=>{fresh();assert(run(`(()=>{events=[{kind:'cone',d:1000,state:'idle'}];cars=[makeTraffic(1100,'same',0)];ambulance={d:playerD()-450,t:0,lane:0,offset:-100,x:road(playerD()-450).m-100,actualV:0};const xx=ambulance.x;updateAmbulance(.016);return events.length===1&&cars.length===1&&Math.abs(ambulance.x-xx)<=.401})()`))});
test('ambulance reserves a quiet interval without deleting obstacles',()=>{fresh();assert(run(`(()=>{nextAmbulance=0;events=[{kind:'cone',d:1000,state:'idle'}];const n=events.length;spawnEvent(1200);spawnTraffic(1300);return events.length===n&&cars.length===0})()`))});
test('reverse encounter joins oncoming traffic at its actual position',()=>{fresh();assert(run(`(()=>{const e={kind:'reverse',d:1000,state:'active',timer:7.29,wait:0,type:'sedan'};events=[e];updateEvents(.02);return e.state==='done'&&cars.length===1&&cars[0].side==='opposite'&&Math.abs(cars[0].d-encounterPose(e).d)<1})()`))});
test('station is centered, wide and cannot be skipped',()=>{fresh();assert(run(`(()=>{trip.station={d:playerD()+1,hold:0,final:false,index:1};const a=stationArea();input.brake=false;speed=0;updateMission(3);return a.x===240&&a.w>=300&&mode==='play'&&tripStopLimit()===trip.station.d})()`))});
test('station story requires braking and manual departure',()=>{fresh();assert(run(`(()=>{trip.station={d:playerD()+1,hold:0,final:false,index:1};x=240;input.brake=true;speed=0;updateMission(2.1);if(mode!=='story')return false;$('storyNext').onclick();if(mode!=='route')return false;const d=playerD();$('depart').onclick();return mode==='countdown'&&playerD()===d&&trip.next===3000})()`))});
test('vehicle contact uses rotated shape and rejects distant vehicles',()=>{fresh();assert(run(`vehicleContact({x,d:playerD(),angle:Math.PI/2},'truck')&&!vehicleContact({x:x+160,d:playerD()},'truck')`))});
test('danger warning is not replaced by score bonus',()=>{fresh();run("toastTime=0;say('⚠️ รถพยาบาลด้านหลัง',5,2);say('หลบผ่าน +25',3,0)");assert.equal(elements.get('tips').dataset.priority,'2')});
test('phone and desktop layouts resize without changing world position',()=>{fresh();assert(run(`(()=>{const pd=playerD();deviceMode='desktop';innerWidth=1440;innerHeight=900;resize();const ok=H>=640&&scale<=620/480&&Math.abs(playerD()-pd)<.01;deviceMode='phone';innerWidth=390;innerHeight=844;resize();return ok&&Math.abs(playerD()-pd)<.01})()`))});
test('all render paths include cats, snakes, UFOs and road encounters',()=>{fresh();run("events=['cat','snake','signal','reverse','uturn','oncoming','rightturn','merge','junction','door','broken'].map((kind,i)=>({kind,d:playerD()+150+i*3,state:'active',timer:2,wait:0,side:1,present:true,truckX:0,crossX:100,carD:500,variant:i}));draw();drawVehicle({x:100,d:500},'ufo','#fff')")});
for(const device of ['phone','desktop'])test('complete 9000 trip with mandatory stories: '+device,()=>{
 fresh();const result=run(`(()=>{Math.random=(()=>{let seed=42;return ()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296)})();
 deviceMode='${device}';innerWidth=deviceMode==='desktop'?1440:390;innerHeight=deviceMode==='desktop'?900:844;resize();sessionType='free';reset(false);name='ทดสอบระบบ';$('storyNext').onclick();let frames=0,rests=0,stories=1;
 while(mode!=='over'&&frames++<350000){
 if(mode==='story'){stories++;$('storyNext').onclick();continue}if(mode==='route'){rests++;$(rests%2?'highway':'community').onclick();$('depart').onclick();continue}
 if(mode==='countdown'){update(.016);continue}if(mode!=='play')throw Error('unexpected mode '+mode);
 const pd=playerD(),r=road(pd);let target=laneX(pd,'same',0),br=false;
 if(trip.station){const gap=trip.station.d-pd;if(gap<220){target=240;br=gap<25}}
 else{
 const e=events.find(e=>e.state!=='done'&&e.d-pd> -100&&e.d-pd<420);
 if(e){const gap=e.d-pd;if(movingKind(e)&&gap<250)br=true;if(['door','cone','pothole'].includes(e.kind)&&gap<300)target=r.m-20}
 for(const c of cars)if(c.side==='same'&&c.d-pd>0&&c.d-pd<180&&Math.abs(c.x-target)<60)br=true;
 if(ambulance){target=ambulance.offset< -40?r.m-12:r.left+30}
 }
 input.brake=br;input.left=x>target+2;input.right=x<target-2;input.accel=false;update(.016);
 }
 return {score:score(),frames,rests,stories,lives,crashes:stats.crashes,completed:trip.completed,mode,time,pd:playerD(),speed,ambulance:ambulance&&{d:ambulance.d,x:ambulance.x,t:ambulance.t},actors:events.filter(e=>e.state!=='done').slice(0,2),cars:cars.slice(0,2)};})()`);
 console.log(result);assert.equal(result.mode,'over');assert.equal(result.score,9000);assert.equal(result.rests,5);assert.equal(result.stories,8);assert.equal(result.completed,true);
});
const scoringPath=path.resolve(root,'../../online/supabase/functions/game-api/scoring.ts');
const ts=fs.readFileSync(scoringPath,'utf8');vm.runInContext(require('node:module').stripTypeScriptTypes(ts.replace('export function','function')),context);
test('completed frontend trip validates on the online scoring server',()=>{assert.equal(run("computeScore(storage('ssar_history',[])[0],Math.ceil(time))"),9000)});
test('wet and damaged surfaces reward unboosted riding without heart loss',()=>{fresh();assert(run(`(()=>{events=[{kind:'puddle',d:playerD()-181,state:'active',timer:0,wait:0},{kind:'broken',d:playerD()-182,state:'active',timer:0,wait:0}];const l=lives,p=penalty;input.accel=false;updateEvents(.016,playerD()-2,playerD());return lives===l&&penalty===p&&points===50})()`))});
test('rear traffic leaves braking room for the rider',()=>{fresh();assert(run(`(()=>{cars=[makeTraffic(playerD()-110,'same',0,{x,actualV:95})];speed=0;for(let i=0;i<120;i++)updateTraffic(.016,playerD());return lives===3&&playerD()-cars[0].d>=80})()`))});
test('legacy mission scoring remains compatible',()=>{context.metrics={version:4,type:'mission',distance:2600,elapsed:30,safe:2,stops:1,crashes:0,penalty:0,delivered:true,stats:{school:1,signals:0}};assert.equal(run('computeScore(metrics,30)'),437)});
test('mixed route rounding agrees exactly with server',()=>{fresh();for(let i=0;i<30;i++){const a=1000.3+i*237.31,b=4000.8+i*371.78;run(`trip.distance={community:${a},highway:${b}};points=penalty=0`);context.metrics={version:5,type:'free',distance:Math.floor(a+b),elapsed:250,safe:0,stops:0,crashes:0,recovered:0,penalty:0,delivered:false,route_distance:{community:Math.floor(a),highway:Math.floor(b)},trip_completed:false,stats:{school:0,signals:0}};assert.equal(run('score()'),run('computeScore(metrics,250)'))}});
