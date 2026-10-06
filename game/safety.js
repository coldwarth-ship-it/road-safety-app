/* Continuous world coordinates; encounters never remove visible traffic to make room. */
'use strict';
let deviceMode=storage('ssar_device','phone'),warningPriority=0,lastAnimal=0;
const baseResize=resize,baseRoad=road,baseMedian=medianAt,baseSay=say,baseWeather=weather;
function roadSurfaceWeather(d=playerD()){const w=baseWeather();if(sessionType==='mission')return w;return ['day','rain','afterRain'][mod(Math.floor((d-H*.25)/3600),3)]}
function roadIsWet(){return ['rain','afterRain'].includes(roadSurfaceWeather())}
function movementDistance(v=speed){const decel=roadIsWet()?190:310;return clamp(v*1.1+v*v/(2*decel)+30,150,430)}
function motionReady(e,gap){if(e.moving||e.timer>0)return true;const trafficNear=cars.some(c=>c.side==='same'&&c.d>playerD()&&e.d-c.d>=0&&e.d-c.d<=movementDistance(c.actualV||c.v));if(gap<=movementDistance()||trafficNear){e.moving=true;e.startGap=gap;return true}return false}
const VEHICLES={door:{w:44,h:11},sedan:{w:42,h:78},pickup:{w:42,h:82},van:{w:44,h:90},truck:{w:52,h:105},ufo:{w:46,h:64}};
function bindDeviceSettings(){
 $('deviceMode').value=deviceMode;
 const describe=()=>{$('deviceDescription').textContent=deviceMode==='desktop'?'คอม: มองทางได้ไกลขึ้น รถขนาดพอดีจอ • A/D หรือ ← → เลี้ยว • ↓/Space เบรก • ↑ เร่ง':'โทรศัพท์: ปัดซ้าย/ขวา เบรกซ้าย เร่งขวา • เล่นได้ทั้งแนวตั้งและแนวนอน'};
 $('deviceMode').onchange=()=>{deviceMode=$('deviceMode').value;try{localStorage.setItem('ssar_device',JSON.stringify(deviceMode))}catch{}resize();describe()};describe();
}
resize=function(){
 if(deviceMode!=='desktop'){ox=0;document.getElementById('game').classList.remove('desktop');$('riderHud').style.left='';baseResize();return}
 const priorH=H,w=innerWidth,h=innerHeight,field=Math.min(620,w);W=480;H=Math.max(640,480*h/field);scale=Math.min(field/W,h/H);ox=(w-W*scale)/2;oy=0;z+=(priorH-H)*.25;
 const dpr=Math.min(devicePixelRatio||1,2);cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);g.setTransform(scale*dpr,0,0,scale*dpr,ox*dpr,0);
 $('game').classList.add('desktop');$('riderHud').style.left=(ox+12)+'px';if(mode==='play')pauseGame();
};
road=function(d){const r=baseRoad(d);if(trip?.station){const mix=1-smooth(clamp((Math.abs(d-trip.station.d)-180)/420,0,1));r.m=lerp(r.m,240,mix);r.width=lerp(r.width,360,mix);r.left=r.m-r.width/2;r.right=r.m+r.width/2;r.bridge=r.bridge&&mix===0;r.plaza=mix>.01}return r};
medianAt=function(d){return !road(d).plaza&&baseMedian(d)};
laneX=function(d,side,lane=0){const r=road(d),four=smooth(clamp((r.width-230)/70,0,1)),fraction=lerp(.25,lane===0?.375:.125,four);return r.m+(side==='same'?-1:1)*r.width*fraction};
function warningLevel(s){return /หัวใจ|ชน|หลุด|−1/.test(s)?3:/พยาบาล|ไฟแดง|ไฟเขียว|ระวัง|เตรียม|ข้าม|ถอย|กลับรถ|อุกกาบาต|จุดพัก|จอด/.test(s)?2:/\+\d/.test(s)?0:1}
say=function(s,d=3,priority=warningLevel(s)){if(toastTime>0&&priority<warningPriority)return;warningPriority=priority;baseSay(s,d);$('tips').dataset.priority=String(priority)};
collision=function(reason){if(inv||mode!=='play'||tutorial)return;stats.crashes++;lives--;penalty+=35;inv=2;speed=Math.min(speed,30);say(reason+' • −1 หัวใจ • −35 คะแนน',4,3);soundCue('hit');if(prefs.vibration&&navigator.vibrate)navigator.vibrate(90);if(lives<=0)finish()};
function approachDistance(){const reaction=speed*2.4,braking=speed*speed/(2*(roadIsWet()?190:310));return Math.max(390,reaction+braking+90)}
function braking(){return input.brake||keys.ArrowDown||keys[' ']}
function movingKind(e){return ['school','signal','dog','cat','snake','reverse','uturn','rightturn','oncoming','junction','merge'].includes(e.kind)}
function busyEncounter(except=null){return events.some(e=>e!==except&&e.state==='active'&&movingKind(e)&&e.d>playerD()-150&&e.d<playerD()+approachDistance())}
function vehicleType(){const n=Math.random();return trip&&score()>=3000&&n<.28?'ufo':['sedan','pickup','van','truck'][Math.floor(Math.random()*4)]}
function vehicleContact(pose,type='sedan'){
 const b=VEHICLES[type]||VEHICLES.sedan,angle=pose.angle||0,c=Math.cos(angle),s=Math.sin(angle),dx=x-pose.x,dy=-(playerD()-pose.d),pw=12,ph=24;
 return Math.abs(dx)<b.w/2*Math.abs(c)+b.h/2*Math.abs(s)+pw&&Math.abs(dy)<b.w/2*Math.abs(s)+b.h/2*Math.abs(c)+ph&&Math.abs(dx*c+dy*s)<b.w/2+pw*Math.abs(c)+ph*Math.abs(s)&&Math.abs(-dx*s+dy*c)<b.h/2+pw*Math.abs(s)+ph*Math.abs(c);
}
carPosition=function(c){return Number.isFinite(c.x)?c.x:laneX(c.d,c.side,c.lane)};
function makeTraffic(d,side,lane,extra={}){return {d,side,lane,x:laneX(d,side,lane),v:side==='same'?70+Math.random()*25:75+Math.random()*30,actualV:0,color:palette[Math.floor(Math.random()*palette.length)],type:vehicleType(),clock:0,trigger:4+Math.random()*5,brake:false,blink:false,...extra}}
spawnTraffic=function(d){
 if(trip?.station&&Math.abs(d-trip.station.d)<900)return;
 d=Math.max(d,playerD()+H*.75+130);const r=road(d),side=Math.random()<.52?'same':'opposite',lane=r.lanes===4?(Math.random()<.5?0:1):0;
 if(mission&&Math.abs(d-mission.d)<420||events.some(e=>Math.abs(e.d-d)<400)||cars.some(c=>Math.abs(c.d-d)<190&&Math.abs(carPosition(c)-laneX(d,side,lane))<60))return;
 cars.push(makeTraffic(d,side,lane));
};
spawnEvent=function(d){
 const sequence=['dog','rightturn','cat','school','oncoming','snake','junction','dog','uturn','reverse','cat','signal','door','snake','merge','pothole','cone','broken'];
 const choices=sessionType==='mission'?[...STAGES[selectedStage].hazards,'reverse','cat','snake','rightturn','oncoming','junction','merge','uturn']:sequence;
 let kind=choices[eventsMade++%choices.length];
 d=Math.max(d,playerD()+H*.75+140,...events.map(e=>e.d+700));
 if(trip?.station&&d<trip.station.d+900)return trip.station.d+1100;
 while(cars.some(c=>Math.abs(c.d-d)<420))d+=190;
 if(kind==='uturn')while(road(d).lanes!==4||road(d).bridge||mod(d,1500)<350||mod(d,1500)>1050)d+=80;
 if(mission&&d>mission.d-430)return mission.d+500;
 const surfaceWeather=roadSurfaceWeather(d);if(['rain','afterRain'].includes(surfaceWeather)&&eventsMade%3===0&&!['dog','cat','snake'].includes(kind))kind=eventsMade%6===0?'pothole':'puddle';
 events.push({kind,d,state:'idle',timer:0,wait:0,failed:false,side:Math.random()<.5?-1:1,crossX:0,phase:0,truckX:0,present:kind!=='uturn'||Math.random()<.6,type:vehicleType(),peopleSeed:eventsMade,variant:eventsMade%4});return d;
};
updateTraffic=function(dt,np){
 if(dt<=0)return;
 for(const side of ['same','opposite']){
  const dir=side==='same'?1:-1,ordered=cars.filter(c=>c.side===side).sort((a,b)=>dir*(b.d-a.d));
  for(let i=0;i<ordered.length;i++){
   const c=ordered[i],old=c.d,oldX=carPosition(c);c.clock=(c.clock||0)+dt;c.type=c.type||'sedan';
   let targetX=laneX(old,side,c.lane),indicator=false;
   if(side==='same')for(const e of events)if(e.kind==='door'&&Math.abs(e.d-old)<310){const r=road(old);targetX=Math.max(targetX,r.left+80);indicator=true}
   const lateral=targetX-oldX,cue=Math.abs(lateral)>5;
   if(cue||indicator){c.lateralCue=(c.lateralCue||0)+dt;c.blink=true;c.blinkSide=lateral>=0?1:-1}else {c.lateralCue=0;c.blink=false}
   const roadShift=road(old+dir*c.v*dt).m-road(old).m;
   c.x=oldX+roadShift+(c.lateralCue>.9?clamp(lateral,-24*dt,24*dt):0);
   let available=Infinity,target=c.v;if(side==='same'&&np>old&&Math.abs(c.x-x)<60)available=Math.max(0,np-old-24-VEHICLES[c.type].h/2-25);
   for(const e of events)if(eventBlocksTraffic(e)&&dir*(e.d-dir*145-old)>=0)available=Math.min(available,dir*(e.d-dir*145-old));
   for(let j=0;j<i;j++){const lead=ordered[j],futureD=old+dir*target*1.5,mergeGap=Math.abs(laneX(futureD,side,c.lane)-laneX(futureD,side,lead.lane));if(Math.abs(carPosition(lead)-c.x)<60||mergeGap<60){const gap=dir*(lead.d-old);if(gap>=0)available=Math.min(available,Math.max(0,gap-(VEHICLES[c.type].h+VEHICLES[lead.type||'sedan'].h)/2-25))}}
   const desired=Math.min(target,Math.sqrt(Math.max(0,2*160*available))),v0=c.actualV===undefined?c.v:c.actualV;
   c.actualV=clamp(desired,Math.max(0,v0-180*dt),v0+65*dt);const movement=Math.min(c.actualV*dt,Math.max(0,available));c.d=old+dir*movement;c.brake=c.actualV<c.v*.8;
   // Road positions remain continuous even when the lane count changes.
   c.x+=road(c.d).m-road(old+dir*c.v*dt).m;
   if(side==='same'&&c.d-np>65&&c.d-np<145&&Math.abs(c.x-x)<32&&speed>c.actualV+15){nearTime+=dt;if(nearTime>2){stats.tail++;penalty+=10;nearTime=0;say('จี้ท้ายรถหน้า • −10 คะแนน • เพิ่มระยะ',3,2)}}
   if(!c.playerHit&&vehicleContact({x:c.x,d:c.d},c.type)){c.playerHit=true;collision(side==='same'?'ชนรถหน้า':'ชนรถสวนทาง')}
  }
 }
};
function eventWarn(e){const labels={school:trip&&score()>4000?'เอเลียนรอข้ามถนน • เตรียมหยุด':'คนรอข้ามถนน • เตรียมหยุด',signal:'ไฟแดง • หยุดหลังเส้น • รถข้ามแยกทั้งสองทิศ',dog:'สุนัขริมทาง • เตรียมเบรก',cat:'แมวริมทาง • เตรียมเบรก',snake:'งูริมทาง • เตรียมเบรก',reverse:'รถเปิดไฟถอย • เตรียมเบรก รถจะถอยแล้วกลับไปฝั่งรถสวน',door:'ประตูรถกำลังแง้ม • เว้นระยะ',merge:'ทางร่วม • รถเปิดไฟเลี้ยวเข้าฝั่งเรา',junction:'ทางแยก • มองซ้ายขวาและชะลอ',rightturn:'รถหน้าเปิดไฟเลี้ยวขวา • เตรียมเบรก',oncoming:'รถสวนเริ่มกินเลน • ชะลอและเผื่อที่หลบ',uturn:'จุดกลับรถ • รถเปิดไฟเลี้ยว • เตรียมเบรก',puddle:'น้ำขัง • ไม่กดเร่งขณะผ่าน เพื่อรับโบนัส',broken:trip&&score()>4000?'☄️ รอยอุกกาบาตข้างหน้า • ไม่กดเร่งขณะผ่าน':'ถนนชำรุด • ไม่กดเร่งขณะผ่าน',cone:'กรวยข้างหน้า • ชะลอและหลบ',pothole:'หลุมข้างหน้า • ชะลอและหลบ'};say('⚠️ '+labels[e.kind],5,2)}
encounterPose=function(e){const r=road(e.d),t=e.timer;
 if(e.kind==='reverse'){if(t<1.5)return {x:r.left-22,d:e.d,angle:0};if(t<3.3){const q=smooth((t-1.5)/1.8);return {x:lerp(r.left-22,r.left+25,q),d:e.d-50*q,angle:0}}const q=smooth(clamp((t-3.3)/4,0,1));return {x:lerp(r.left+25,laneX(e.d,'opposite',0),q),d:e.d-50+Math.sin(q*Math.PI)*35,angle:q*Math.PI}}
 if(e.kind==='uturn'){const q=smooth(clamp((t-1.5)/4,0,1));return {x:lerp(laneX(e.d,'opposite',1),laneX(e.d,'same',1),q),d:e.d-55*Math.sin(q*Math.PI),angle:Math.PI*(1-q)}}
 if(e.kind==='rightturn'){const q=smooth(clamp((t-1.5)/3,0,1));return {x:lerp(laneX(e.d,'same',1),r.right+80,q)+Math.max(0,t-4.5)*80,d:e.d+40-40*Math.sin(q*Math.PI),angle:q*Math.PI/2}}
 const q=clamp((t-1.2)/4,0,1);return {x:laneX(e.d,'opposite',0)-(r.width*.25+8)*Math.sin(q*Math.PI),d:e.d+170-Math.max(0,t-1.2)*80,angle:Math.PI};
};
function handoff(e,pose,side,lane){if(e.transferred)return;e.transferred=true;cars.push(makeTraffic(pose.d,side,lane,{x:pose.x,v:80,actualV:55,type:e.type||'sedan',color:'#80a590',playerHit:!!e.contacted,lateralCue:1,blink:true}));e.state='done';award(e,25)}
function animalPosition(e){const r=road(e.d),dir=e.side<0?1:-1,v=e.kind==='cat'?105:e.kind==='snake'?44:85;return {x:e.side<0?r.left-50+e.timer*v:r.right+50-e.timer*v,d:e.d,dir,v}}
function animalContact(e,p){const dy=-(playerD()-p.d),dx=x-p.x;let nodes;
 if(e.kind==='snake')nodes=Array.from({length:9},(_,i)=>({x:(i-4)*6,y:Math.sin(i*.8+e.timer*7)*6,r:3.5}));
 else nodes=e.kind==='cat'?[{x:-3,y:0,r:13},{x:18*p.dir,y:-7,r:8}]:[{x:-2,y:0,r:18},{x:21*p.dir,y:-6,r:10}];
 return nodes.some(n=>{const nearX=clamp(n.x,dx-12,dx+12),nearY=clamp(n.y,dy-24,dy+24);return (nearX-n.x)**2+(nearY-n.y)**2<n.r*n.r});
}
updateEvents=function(dt,oldD,pd){
 for(const e of events){const gap=e.d-pd,r=road(e.d);
  if(e.state==='idle'&&gap<approachDistance()&&!busyEncounter(e)){e.state='active';e.timer=0;eventWarn(e)}
  if(e.state!=='active')continue;
  if(speed<2&&gap>80&&gap<300)e.wait+=dt;
  if(e.kind==='school'){
   if(motionReady(e,gap))e.timer+=dt;
   if(e.timer>0){e.crossX=lerp(r.left-45,r.right+170,clamp(e.timer/6,0,1));if(e.timer<6&&e.wait>.6&&speed>12&&gap>34&&gap<260&&!e.early){stats.early++;risk(e,'early',25,'ออกตัวก่อนคนข้ามพ้นถนน')}
    if(e.timer<6&&oldD<e.d-34&&pd>=e.d-34&&speed>2&&!e.crossViolation){stats.early++;risk(e,'crossViolation',25,'ผ่านทางม้าลายก่อนคนข้ามเสร็จ')}
    for(let i=0;i<5;i++){const dx=e.crossX-i*24,dd=e.d-(i%2?10:-8);if(Math.abs(pd-dd)<43&&Math.abs(x-dx)<20&&!e.contacted){e.contacted=true;e.failed=true;collision('ชนคนข้ามถนน')}}
    if(e.timer>=6){e.state='done';if(e.wait>.6)award(e,50);else e.failed=true}
   }
  }else if(e.kind==='signal'){
   e.timer+=dt;if(e.timer<6){for(let i=0;i<4;i++){const dir=i%2===0?1:-1,age=Math.max(0,e.timer-(i<2?0:1.4)),px=dir===1?-90+age*160:W+90-age*160;if(vehicleContact({x:px,d:e.d+(dir===1?-28:28),angle:dir*Math.PI/2},i<2?'sedan':'pickup')&&!e.contacted){e.contacted=true;e.failed=true;collision('ชนรถข้ามแยกขณะไฟแดง')}}if(oldD<e.d-75&&pd>=e.d-75&&!e.redViolation){stats.red++;risk(e,'redViolation',40,'ฝ่าไฟแดง')}
    if(!e.horn&&e.timer>4.6){e.horn=true;soundCue('horn');say('⚠️ หัวรถบรรทุกด้านซ้าย • ได้ไฟเขียวแล้วต้องตรวจทางแยก',3,2)}
   }else{e.phase=1;if(!e.greenWarn){e.greenWarn=true;say('⚠️ ไฟเขียว • รถบรรทุกฝ่าไฟแดงจากซ้าย • ยังต้องรอ!',4,2)}e.truckX=r.left-112+(e.timer-6)*210;
    if(vehicleContact({x:e.truckX,d:e.d,angle:Math.PI/2},'truck')&&!e.contacted){e.contacted=true;e.failed=true;collision('ชนรถบรรทุกฝ่าไฟแดง')}
    if(e.truckX>W+90){e.state='done';if(e.wait>.6)award(e,60)}
   }
  }else if(['dog','cat','snake'].includes(e.kind)){
   if(motionReady(e,gap))e.timer+=dt;const p=animalPosition(e);e.crossX=p.x;if(e.timer>0&&animalContact(e,p)&&!e.contacted){e.contacted=true;e.failed=true;collision(e.kind==='cat'?'ชนแมว':e.kind==='snake'?'ชนงู':'ชนสุนัข')}
   if(p.x< -70||p.x>W+70){e.state='done';award(e,25)}
  }else if(e.kind==='door'){
   if(motionReady(e,gap))e.timer+=dt;const cx=r.left-1;
   const body=vehicleContact({x:cx,d:e.d},'sedan'),door=e.timer>.8&&e.timer<4.5&&vehicleContact({x:cx+39,d:e.d+11,angle:-.7},'door');
   if((body||door)&&!e.contacted){e.contacted=true;e.failed=true;collision('ชนรถจอดหรือประตูรถ')}
  }else if(['reverse','uturn','rightturn','oncoming'].includes(e.kind)){
   if(e.kind==='uturn'&&!e.present){e.state='done';continue}if(motionReady(e,gap))e.timer+=dt;
   const pose=encounterPose(e);e.crossX=pose.x;e.carD=pose.d;if(vehicleContact(pose,e.type||'sedan')&&!e.contacted){e.contacted=true;e.failed=true;collision(e.kind==='reverse'?'ชนรถถอยกลับรถ':e.kind==='oncoming'?'ชนรถสวนกินเลน':e.kind==='uturn'?'ชนรถกลับรถ':'ชนรถเลี้ยวขวา')}
   if(e.kind==='reverse'&&e.timer>=7.3)handoff(e,pose,'opposite',0);else if(e.kind==='uturn'&&e.timer>=5.5)handoff(e,pose,'same',1);else if(e.kind==='oncoming'&&e.timer>=5.2)handoff(e,pose,'opposite',0);else if(e.kind==='rightturn'&&pose.x>W+80){e.state='done';award(e,25)}
  }else if(e.kind==='merge'){
   if(motionReady(e,gap))e.timer+=dt;const q=smooth(clamp((e.timer-1.2)/3.5,0,1));e.crossX=lerp(r.left-100,laneX(e.d,'same',0),q);e.carD=e.d+Math.max(0,e.timer-4.7)*65;
   if(vehicleContact({x:e.crossX,d:e.carD,angle:-.4*(1-q)},e.type||'sedan')&&!e.contacted){e.contacted=true;e.failed=true;collision('ชนรถจากทางร่วม')}
   if(e.timer>=4.7)handoff(e,{x:e.crossX,d:e.carD},'same',0);
  }else if(e.kind==='junction'){
   if(motionReady(e,gap))e.timer+=dt;e.crossX=W+70-Math.max(0,e.timer-1.3)*105;
   if(vehicleContact({x:e.crossX,d:e.d,angle:-Math.PI/2},e.type||'sedan')&&!e.contacted){e.contacted=true;e.failed=true;collision('ชนรถข้ามแยก')}
   if(e.crossX< -80){e.state='done';award(e,25)}
  }else if(e.kind==='puddle'||e.kind==='broken'){
   if(Math.abs(gap)<70&&Math.abs(x-laneX(e.d,'same',0))<42){e.surfaceTouched=true;if(input.accel||keys.ArrowUp)e.surfaceBoosted=true}
  }else if(Math.abs(gap)<(e.kind==='cone'?40:44)&&Math.abs(x-laneX(e.d,'same',0))<(e.kind==='cone'?25:35)&&!e.contacted){e.contacted=true;e.failed=true;collision(e.kind==='cone'?'ชนกรวย':'ตกหลุมถนน')}
  if(gap< -180&&!movingKind(e)){if(!e.surfaceBoosted)award(e,25);e.state='done'}
 }
 // Active actors live until they leave the screen or hand off; passing their origin is not removal.
 events=events.filter(e=>e.state!=='done'||e.d>pd-H*.25-200);
};
eventBlocksTraffic=function(e){return e.state==='active'&&movingKind(e)||e.kind==='door'&&e.state==='active'&&e.timer<4.5};
stationArea=function(){if(!trip?.station)return null;return {x:240,d:trip.station.d,w:310,h:210}};
tripParkingSafe=function(d,px){const a=stationArea();return !!a&&Math.abs(d-a.d)<230&&Math.abs(px-a.x)<170};
function tripStopLimit(){return trip?.station?trip.station.d:null}
clearStationArea=function(){const s=trip.station;nextEvent=Math.max(nextEvent,s.d+1100);nextTraffic=Math.max(nextTraffic,s.d+1100);nextAmbulance=Math.max(nextAmbulance,s.d+2200)};
createStation=function(final=false){
 if(ambulance||busyEncounter())return;
 const visibleEnd=playerD()+H*.75+550,lastActor=Math.max(visibleEnd,...events.filter(e=>e.state!=='done').map(e=>e.d+800),...cars.map(c=>c.d+800));
 trip.station={d:lastActor,hold:0,final,index:Math.min(5,trip.next/1500),warned:false};clearStationArea();say(final?'📦 เมืองเซลตี้ • ช่องส่งพัสดุกลางทาง • ต้องหยุด':'⛽ จุดพักบังคับกลางทาง • เตรียมเบรกและหยุด 2 วินาที',6,2);
};
updateMission=function(dt){
 if(!trip){originalUpdateMission(dt);return}const distance=speed*dt;travelled+=distance;trip.distance[trip.route]+=distance;updateMissionText();
 if(!trip.station&&score()>=trip.next)createStation(trip.next===TRIP_LIMIT);
 const s=trip.station;if(!s)return;const gap=s.d-playerD();
 if(gap<approachDistance()+200&&!s.warned){s.warned=true;say('⛽ จุดจอดกลางทาง • กดเบรกหยุด 2 วินาทีเพื่ออ่านเรื่อง',6,2)}
 if(gap<180&&gap>=-1&&Math.abs(x-240)<155&&speed<2&&braking()){s.hold+=dt;if(s.hold>=2)arriveAtStation()}else s.hold=0;
 if(gap<60&&speed<2&&!braking())say('⛽ กดเบรกค้าง 2 วินาที • ต้องอ่านเรื่องก่อนเดินทางต่อ',2,2);
};
updateAmbulance=function(dt){
 const pd=playerD();
 if(!ambulance&&pd>nextAmbulance&&!trip?.station&&!busyEncounter()&&!events.some(e=>e.state==='active'&&Math.abs(e.d-pd)<380)&&!cars.some(c=>Math.abs(c.d-pd)<220)){
  const r=road(pd),lane=r.lanes===4&&Math.random()<.5?1:0,offset=r.lanes===4?laneX(pd,'same',lane)-r.m:-18;
  ambulance={d:pd-300,t:0,lane,offset,x:r.m+offset,failed:false,blocked:0,actualV:0};nextAmbulance=pd+4800;
  say('🚑 ด้านหลัง '+(r.lanes===4?(lane===0?'เลนซ้าย ⬅ หลบทางขวาในฝั่งเรา':'เลนขวา ➡ หลบชิดซ้าย'):'เลนขวาใกล้เส้นกลาง ➡ หลบชิดซ้าย'),7,2);
 }
 const a=ambulance;if(!a)return;a.t+=dt;
 // Keep the announced corridor, following road bends continuously even while overtaking.
 const own=road(a.d),four=smooth(clamp((own.width-230)/70,0,1)),corridor=a.offset< -40?lerp(-own.width/2+26,-own.width*.375,four):lerp(-18,-own.width*.125,four),target=own.m+corridor;a.x+=clamp(target-a.x,-25*dt,25*dt);
 if(prefs.sound&&Math.floor(a.t*2)!==a.beat){a.beat=Math.floor(a.t*2);soundCue(a.beat%2?'sirenHi':'sirenLo')}
 if(a.t<3){a.d+=Math.max(0,speed)*dt;a.x+=road(a.d).m-own.m;return}
 const gap=pd-a.d,blocked=gap>65&&gap<150&&Math.abs(x-a.x)<45;
 const desired=Math.max(340,speed+260);a.actualV=desired;
 if(blocked){a.blocked+=dt;if(a.blocked>.3&&!a.blockedOnce){a.blockedOnce=true;a.failed=true;penalty+=25;say('กีดขวางรถพยาบาล • −25 คะแนน • ให้ทางเมื่อปลอดภัย',4,2)}}
 a.d+=a.actualV*dt;a.x+=road(a.d).m-own.m;
 if(vehicleContact({x:a.x,d:a.d},'truck')&&!a.contacted){a.contacted=true;a.failed=true;collision('ชนรถพยาบาล')}
 if(a.d-pd>H*.75+120){if(!a.failed){points+=25;stats.safe++;say('ให้ทางรถพยาบาลอย่างปลอดภัย +25',4,0)}ambulance=null}
};
function drawVehicle(pose,type,color,brake=false,blink=false,blinkSide=1){
 const y=sy(pose.d),angle=pose.angle||0,b=VEHICLES[type]||VEHICLES.sedan;
 if(type==='ufo'){g.save();g.translate(pose.x,y);g.rotate(angle);ellipse(0,0,23,32,'#635684');ellipse(0,-4,15,19,'#9cddd7');line(-14,-24,14,-24,'#fff1be',4);line(-12,25,12,25,brake?'#ff3333':'#bd4e62',4);for(let i=-1;i<=1;i++)ellipse(i*15,3,3,3,'#f9d46c');if(blink&&Math.sin(time*9)>0)rr(blinkSide>0?19:-24,16,5,8,2,'#ffb12d');g.restore();return}
 g.save();g.translate(pose.x,y);g.rotate(angle);if(type!=='truck')g.scale(b.w/42,b.h/78);originalCar(0,0,color,false,brake,blink,type==='truck',0,blinkSide);g.restore();
 if(type==='pickup'||type==='van'){g.save();g.translate(pose.x,y);g.rotate(angle);rr(-16,0,32,type==='van'?28:32,3,type==='van'?'#bed6d9':'#384958');if(type==='pickup')line(-13,13,13,13,'#a8bab7',2);g.restore()}
}
function drawTrafficCar(c){drawVehicle({x:carPosition(c),d:c.d,angle:c.side==='opposite'?Math.PI:0},c.type||'sedan',c.color,c.brake,c.blink,c.blinkSide||1)}
function drawAmbulance(){if(!ambulance)return;const a=ambulance,y=sy(a.d);originalCar(a.x,y,'#f0f3e7',false,false,false,true);rr(a.x-18,y-34,36,8,2,Math.floor(time*8)%2?'#f14155':'#4da4ff');g.textAlign='center';g.font='bold 24px sans-serif';g.fillStyle='#ed4058';g.fillText('+',a.x,y+12)}
function cat(px,py,dir,t){g.save();g.translate(px,py);g.scale(dir,1);ellipse(-3,0,19,9,'#899494');line(-17,-2,-28,-18,'#899494',4);for(let i=0;i<4;i++)line(i<2?-12:8,5,(i<2?-12:8)+Math.sin(t*19+i)*6,17,'#657878',3);ellipse(18,-7,8,9,'#a1aaaa');g.fillStyle='#a1aaaa';g.beginPath();g.moveTo(11,-12);g.lineTo(12,-23);g.lineTo(18,-14);g.lineTo(23,-23);g.lineTo(25,-10);g.fill();ellipse(21,-9,1.5,2,'#d4ee8f');g.restore()}
function snake(px,py,dir,t){g.save();g.translate(px,py);g.scale(dir,1);for(let i=0;i<9;i++)ellipse((i-4)*6,Math.sin(i*.8+t*7)*6,4,4,i%2?'#9aa955':'#6e8849');ellipse(26,Math.sin(8*.8+t*7)*6,6,5,'#b3bb62');ellipse(29,Math.sin(8*.8+t*7)*6-2,1,1,'#172e25');g.restore()}
person=function(px,py,t,variant=0){
 g.save();g.translate(px,py);const size=[.86,1,.95,1.07][variant%4],step=Math.sin(t*10)*6;g.scale(size,size);const alien=trip&&score()>4000&&variant%3!==0,skin=['#e4b68b','#b9825c','#d2a478','#a97450'][variant%4],shirt=['#f3c541','#648bbe','#d77b96','#76a087'][variant%4];line(-4,8,-6+step,20,'#304b79',4);line(4,8,6-step,20,'#304b79',4);line(-6,-5,-13-step*.3,5,skin,3);line(6,-5,13+step*.3,5,skin,3);rr(-8,-10,16,22,5,shirt);ellipse(0,-18,alien?11:8,alien?12:9,alien?'#8fdfbf':skin);if(alien){ellipse(-4,-19,3,5,'#243843');ellipse(4,-19,3,5,'#243843')}else{ellipse(0,-23,8,4,['#38332e','#665349','#373e44','#685a51'][variant%4]);if(variant%4===2)rr(-9,-25,18,5,2,'#eb9367')}g.restore();
};
const sceneryBase=scenery;
scenery=function(){sceneryBase();if(!trip)return;for(let d=Math.floor(playerD()/700)*700;d<playerD()+H;d+=700){const r=road(d),y=sy(d);if(trip.route==='community'){person(r.left-35,y,0,Math.floor(d/700)%4);rr(r.right+15,y+20,55,25,3,'#bd9676');g.fillStyle='#f5e7b0';g.font='9px sans-serif';g.fillText('ชุมชน',r.right+42,y+36)}else{for(let i=0;i<3;i++)tree(r.left-40-i*25,y+i*15,i);rr(r.right+12,y+12,65,25,3,'#3f6f89');g.fillStyle='#fff';g.font='9px sans-serif';g.fillText('สายหลัก',r.right+44,y+29)}}};
const drawEventsBase=drawEvents;
drawEvents=function(){
 const special=['school','signal','reverse','uturn','rightturn','oncoming','merge','junction','dog','cat','snake'];const all=events;events=all.filter(e=>!special.includes(e.kind));drawEventsBase();events=all;
 for(const e of all){const y=sy(e.d),r=road(e.d);if(y< -H||y>H+600)continue;
  if(['signal','junction','merge','reverse','rightturn'].includes(e.kind)){g.fillStyle='#535d61';g.fillRect(0,y-51,W,102);line(0,y,r.left,y,'#e0d9aa',2);line(r.right,y,W,y,'#e0d9aa',2)}
  if(e.kind==='school'){crossing(e,y,r);building(r.left-102,y-150,82,90,2,3);originalCar(r.left-24,y-48,'#65859b');if(e.timer>0&&e.state!=='done')for(let i=0;i<5;i++)person(e.crossX-i*24,y+(i%2?10:-8),e.timer+i,(e.peopleSeed+i)%4);else if(e.state!=='done')person(r.left-38,y,0,e.peopleSeed%4)}
  else if(e.kind==='signal'){
   g.fillStyle='#e8e8d9';g.fillRect(r.left,y+75,r.width/2,5);rr(r.left-30,y+70,24,66,5,'#202b2e');for(let i=0;i<3;i++)ellipse(r.left-18,y+82+i*21,7,7,i===0&&e.phase===0?'#ff3535':i===2&&e.phase===1?'#58ed8e':'#49545b');
   if(e.state!=='done'&&e.timer<6){for(let i=0;i<4;i++){const dir=i%2===0?1:-1,age=Math.max(0,e.timer-(i<2?0:1.4)),px=dir===1?-90+age*160:W+90-age*160;drawVehicle({x:px,d:e.d+(dir===1?-28:28),angle:dir*Math.PI/2},i<2?'sedan':'pickup',dir===1?'#7192b3':'#bf7c68')}
    if(e.timer>4.6)drawVehicle({x:r.left-140+(e.timer-4.6)*20,d:e.d,angle:Math.PI/2},'truck','#c58343')
   }else if(e.state!=='done')drawVehicle({x:e.truckX,d:e.d,angle:Math.PI/2},'truck','#c58343');
  }else if(['dog','cat','snake'].includes(e.kind)){if(e.state==='done')continue;const p=e.timer>0?animalPosition(e):{x:e.side<0?r.left-50:r.right+50,dir:e.side<0?1:-1};(e.kind==='cat'?cat:e.kind==='snake'?snake:dog)(p.x,y,p.dir,e.timer)}
  else if(['reverse','uturn','rightturn','oncoming'].includes(e.kind)){if(e.kind==='uturn'){rr(r.right+12,y+45,35,35,4,'#367fc0');g.fillStyle='#fff';g.font='bold 24px sans-serif';g.fillText('↶',r.right+28,y+73)}if(e.state!=='done'&&(e.kind!=='uturn'||e.present)){drawVehicle(encounterPose(e),e.type||'sedan','#80a590',e.timer<1.5,true,1);if(e.kind==='reverse'&&e.timer<3.3){const p=encounterPose(e);line(p.x-12,sy(p.d)+30,p.x+12,sy(p.d)+30,'#fff4cc',4)}}}
  else if(e.kind==='merge'&&e.state!=='done'){const q=smooth(clamp((e.timer-1.2)/3.5,0,1));drawVehicle({x:lerp(r.left-100,laneX(e.d,'same',0),q),d:e.carD||e.d,angle:-.4*(1-q)},e.type||'sedan','#c3b27b',false,true,1)}
  else if(e.kind==='junction'&&e.state!=='done')drawVehicle({x:e.timer>0?e.crossX:W+70,d:e.d,angle:-Math.PI/2},e.type||'sedan','#6a89b2');
 }
};
drawClues=function(){for(const e of events){if(trip&&score()>4000&&e.kind==='broken'){const y=sy(e.d),r=road(e.d);ellipse(laneX(e.d,'same'),y,33,36,'#423746');ellipse(laneX(e.d,'same')-5,y-6,15,14,'#e68647');line(r.right+20,y-135,r.right+50,y-170,'#ffc577',4)}}for(const e of events){if(e.state!=='active'||e.d-playerD()<80)continue;if(['dog','cat','snake'].includes(e.kind)&&e.timer===0){const r=road(e.d),px=e.side<0?r.left-50:r.right+50;line(px-10,sy(e.d)-28,px-4,sy(e.d)-36,'#ffe09a',2)}}};
drawDelivery=function(){originalDrawDelivery();const a=stationArea();if(!a)return;const y=sy(a.d);if(y<-350||y>H+350)return;rr(a.x-a.w/2,y-a.h/2,a.w,a.h,12,'#315f69');g.strokeStyle='#fff4b7';g.lineWidth=4;g.strokeRect(a.x-a.w/2+10,y-a.h/2+10,a.w-20,a.h-20);rr(a.x-145,y-145,290,35,6,'#ffcf65');g.textAlign='center';g.font='bold 15px sans-serif';g.fillStyle='#173039';g.fillText(trip.station.final?'📦 เมืองเซลตี้ • ต้องหยุดส่งพัสดุ':'⛽ จุดพักบังคับ • หยุด 2 วินาที',a.x,y-121);g.fillStyle='#fff';g.font='bold 17px sans-serif';g.fillText('กดเบรกค้าง • อ่านเรื่อง',a.x,y+12);line(a.x-140,y+100,a.x+140,y+100,'#fff1b7',7);if(trip.station.hold>0){g.fillStyle='#ffcf65';g.fillRect(a.x-a.w/2,y+a.h/2+5,a.w*clamp(trip.station.hold/2,0,1),8)}};
const safetyUpdateBase=update,safetyResetBase=reset,safetyDrawBase=draw;
reset=function(train=false){warningPriority=0;lastAnimal=0;safetyResetBase(train);nextAmbulance=playerD()+2400};
update=function(dt){if(toastTime<=0)warningPriority=0;safetyUpdateBase(dt);if(mode==='play'&&roadSurfaceWeather()==='afterRain'&&toastTime<=0)$('tips').textContent='หลังฝนตก • ถนนยังเปียก ระวังหลุมและน้ำขัง';if(mode==='play'&&ambulance&&toastTime<1)say('🚑 รถพยาบาลด้านหลัง • '+(ambulance.offset< -40?'⬅ เลนซ้าย หลบทางขวาในฝั่งเรา':'➡ เลนขวา หลบชิดซ้าย'),2,2)};
draw=function(){g.save();g.setTransform(1,0,0,1,0,0);g.fillStyle='#10221e';g.fillRect(0,0,cv.width,cv.height);g.restore();g.save();g.beginPath();g.rect(0,0,W,H);g.clip();safetyDrawBase();g.restore()};
