/* Selty trip: modal states deliberately stop the simulation, not just the rider. */
'use strict';
const TRIP_LIMIT=9000,REST_INTERVAL=1500;
const STORY_TEXT=[
 'พี่ชาร์คกี้: ฝากพัสดุสำคัญไปเมืองเซลตี้นะ ห้ามเปิดกล่อง!\nไรเดอร์: ไปไกลแบบนี้ ผมคิดค่าส่งแพงนะ!\nพี่ชาร์คกี้: คิดเพิ่มได้ แต่ห้ามซิ่งเพิ่มนะ!',
 'แวะดื่มน้ำ ยืดเส้น เติมพลัง ก่อนเลือกเส้นทางช่วงถัดไป',
 'แซนด์วิชพร้อม คนพร้อม พัสดุยังปิดสนิท!',
 'ปั๊มนี้แปลก ๆ … แต่การหยุดพักยังสำคัญเหมือนเดิม',
 'เติมพลังที่สถานีอวกาศ อย่าเผลอเอาสายชาร์จมาเสียบแซนด์วิช!',
 'เมืองเซลตี้อยู่ข้างหน้า พักให้พร้อมก่อนส่งพัสดุช่วงสุดท้าย',
 'ถึงหน้าบ้านแล้ว! กดกริ่ง ส่งกล่องที่ปิดสนิทให้ผู้รับ\nเอเลียน: ขอบคุณที่นำของสำคัญมาส่ง!\nไรเดอร์: เอ่อ… เซ็นรับด้วยนิ้วไหนครับ?',
 'ชาวเมืองเซลตี้ขอบคุณที่นำพัสดุมาถึงอย่างปลอดภัย!'
];
let trip=null,ambulance=null,nextAmbulance=0,menuType='free';
function showStory(index,next,label='ปิดการ์ตูน • เริ่มเดินทาง'){
 mode='story';release();updateAudio();$('panel').classList.remove('hidden');$('card').classList.add('story-card');
 $('card').innerHTML=`<img class="story-image" src="assets/story-${String(index+1).padStart(2,'0')}.webp" alt="${esc(STORY_TEXT[index])}"><p class="story-caption">${esc(STORY_TEXT[index]).replaceAll('\n','<br>')}</p><div class="row"><button class="primary" id="storyNext">${label}</button></div>`;
 $('storyNext').onclick=()=>{$('card').classList.remove('story-card');next()};
 // Preload one following scene without loading all eight on a mobile connection.
 if(index<7){const image=new Image();image.src=`assets/story-${String(index+2).padStart(2,'0')}.webp`}
}
function resumeDriving(){release();$('panel').classList.add('hidden');mode='countdown';countdown=3;unlockAudio()}
function menu(){
 release();mode='menu';trip=null;ambulance=null;updateAudio();loadProfile();$('panel').classList.remove('hidden');$('card').classList.remove('story-card');
 $('card').innerHTML=`<div class="menu-head"><img class="sharky" src="assets/story-01.webp" alt="พี่ชาร์คกี้ฉลามใจดี"><div><div class="badge">SSAR • RIDER SAFETY</div><h1>พัสดุปริศนา</h1><p class="compact">สู่เมืองเซลตี้ • ${level()}<br>คะแนนสะสม ${profile.xp} • สูงสุด ${profile.best}</p></div></div>
 <label class="select-label" for="name">ชื่อไรเดอร์</label><input id="name" maxlength="16" placeholder="ใส่ชื่อก่อนเริ่ม" aria-label="ชื่อผู้เล่น">
 <label class="select-label" for="playMode">เลือกโหมด • อยากเล่นแบบไหน?</label><select id="playMode"><option value="free">โหมดทริป • ส่งพัสดุถึงเมืองเซลตี้</option><option value="mission">โหมดภารกิจ • ฝึกสถานการณ์แต่ละด่าน</option><option value="tutorial">ฝึกเล่น • เรียนรู้การควบคุม</option></select><p id="modeDescription" class="compact mode-description"></p>
 <div id="stageSettings"><label class="select-label" for="stage">เลือกด่านภารกิจ</label><select id="stage">${STAGES.map((s,i)=>`<option value="${i}" ${i===selectedStage?'selected':''} ${i>0&&!profile.completed.includes(i-1)?'disabled':''}>${i+1}. ${s.name}${i>0&&!profile.completed.includes(i-1)?' • ยังไม่ปลดล็อก':''}</option>`).join('')}</select><p id="stageDescription" class="compact"></p></div>
 <p class="compact">ปัดซ้าย/ขวาหรือ ◀ ▶ • เบรกซ้าย • เร่งขวา<br>คอมใช้ A/D หรือปุ่มลูกศร • ไม่มีโบนัสจากความเร็ว</p><div class="row"><button class="small" id="garage">สีรถและชุด • ใช้ได้ทุกสี</button><button class="small" id="medals">เหรียญและด่าน</button><button class="small" id="account">คะแนนออนไลน์</button></div>${settingsMarkup()}<p class="compact" id="cloudStatus">${cloudStatus()}</p><p class="compact"><a href="../index.html" style="color:#92e5df">← กลับเว็บจุดเสี่ยง</a></p><div class="row start-row"><button class="primary" id="start">เริ่มเล่น</button></div>`;
 $('name').value=storage('rg_n','');$('playMode').value=menuType;
 const describe=()=>{menuType=$('playMode').value;$('stageSettings').classList.toggle('hidden',menuType!=='mission');$('modeDescription').textContent=menuType==='free'?'นำพัสดุปริศนาไปเมืองเซลตี้ • จบที่ 9,000 คะแนน • จุดพักและเลือกเส้นทางทุก 1,500 คะแนน • จอดพักได้หัวใจ +1 (สูงสุด 3)':menuType==='mission'?'เลือกด่านด้านล่าง ขับถึงจุดส่งของแล้วจอดให้เรียบร้อย เพื่อปลดล็อกด่านถัดไป':'ฝึกเลี้ยว เบรก และหยุดรอ ไม่มีการเสียหัวใจหรือบันทึกคะแนน';$('stageDescription').textContent='สถานการณ์: '+STAGES[Number($('stage').value)||0].name+' • จอดในช่องส่งของเมื่อถึงจุดหมาย'};
 $('playMode').onchange=describe;$('stage').onchange=describe;describe();
 $('start').onclick=()=>{name=$('name').value.trim();if(!name){$('name').focus();return}try{localStorage.setItem('rg_n',JSON.stringify(name))}catch{}selectedStage=Number($('stage').value)||0;sessionType=menuType==='free'?'free':'mission';unlockAudio();reset(menuType==='tutorial')};
 $('garage').onclick=garage;$('medals').onclick=medalScreen;$('account').onclick=accountScreen;bindSettings();
}
async function accountScreen(){
 mode='menu';release();updateAudio();$('card').classList.remove('story-card');loadProfile();
 const history=storage('ssar_history',[]).slice(0,8);
 $('card').innerHTML=`<div class="badge">คะแนนออนไลน์</div><h1>คะแนนของคุณ</h1><p>สูงสุด ${profile.best} • สะสม ${profile.xp}</p><p id="accountStatus">${esc(cloudStatus())}</p><p class="compact">ระบบจดจำผู้เล่นอัตโนมัติในเบราว์เซอร์นี้ ไม่ต้องใส่อีเมล<br>คะแนนแต่ละรอบบันทึกเมื่อจบรอบ และตรวจสอบผ่านระบบออนไลน์</p><div class="row"><button class="small" id="retry">ส่งผลรอบที่ค้าง</button><button class="small" id="weekly">อันดับสัปดาห์นี้</button><button class="small" id="alltime">อันดับรวม</button></div><div id="ranking"></div><p class="compact">รอบล่าสุดในเครื่องนี้<br>${history.length?history.map(r=>`${esc(r.nickname)} • ${r.client_score} คะแนน`).join('<br>'):'ยังไม่มีรอบที่จบ'}</p><div class="row"><button class="primary" id="back">กลับหน้าหลัก</button></div>`;
 $('back').onclick=menu;$('retry').onclick=async()=>{await syncOutbox();if($('accountStatus'))$('accountStatus').textContent=cloudStatus()};
 const rank=async period=>{try{const data=await cloudCall('leaderboard',{period});if($('ranking'))$('ranking').textContent=data.rows?.length?data.rows.map((r,i)=>`${i+1}. ${r.nickname} • ${r.score}`).join('\n'):'ยังไม่มีคะแนนที่ยืนยันในช่วงนี้'}catch{if($('ranking'))$('ranking').textContent='โหลดอันดับไม่ได้ กรุณาลองใหม่'}};
 $('weekly').onclick=()=>rank('weekly');$('alltime').onclick=()=>rank('all');
 if(CLOUD_CONFIG)try{await getCloud();if(cloudUser){const data=await cloudCall('progress');if(data.profile){profile={...blankProfile(),...data.profile};storeProfile()}if($('accountStatus'))$('accountStatus').textContent=cloudStatus()}}catch{if($('accountStatus'))$('accountStatus').textContent='ติดต่อระบบไม่ได้ • ผลในเครื่องยังอยู่'}
}
const originalReset=reset;
reset=function(train=false){trip=null;ambulance=null;nextAmbulance=playerD()+3500;originalReset(train);if(!train){if(sessionType==='free')trip={route:'community',distance:{community:0,highway:0},next:1500,station:null,recovered:0,completed:false};updateMissionText();if(trip)say('📦 นำพัสดุปริศนาไปเมืองเซลตี้ • ขับปลอดภัยและพักทุก 1,500 คะแนน',5);showStory(0,resumeDriving)}nextAmbulance=playerD()+3500};
const originalScore=score;
score=function(){return trip?Math.min(TRIP_LIMIT,Math.max(0,Math.floor(Math.floor(trip.distance.community)/4+Math.floor(trip.distance.highway)/8)+points-penalty)):originalScore()};
difficulty=function(){return clamp(score()/(trip?9000:1800),0,1)};
function stationArea(){if(!trip?.station)return null;const s=trip.station,r=road(s.d);return {x:r.left-14,d:s.d,w:102,h:190}}
function tripParkingSafe(d,px){const a=stationArea();return !!a&&Math.abs(d-a.d)<125&&Math.abs(px-a.x)<a.w/2+10}
function clearStationArea(){const s=trip.station;events=events.filter(e=>Math.abs(e.d-s.d)>600);cars=cars.filter(c=>Math.abs(c.d-s.d)>700);ambulance=null;nextEvent=Math.max(nextEvent,s.d+750);nextTraffic=Math.max(nextTraffic,s.d+750);nextAmbulance=s.d+3200}
function createStation(final=false){trip.station={d:playerD()+650,hold:0,final,index:Math.min(5,trip.next/1500),warned:false};clearStationArea();say(final?'เมืองเซลตี้อยู่ข้างหน้า • จอดช่องส่งพัสดุด้านซ้าย':'⛽ จุดพักด้านซ้าย • จอดนิ่ง 2 วินาทีรับหัวใจ +1',6)}
function routeChoice(rested){
 mode='route';release();updateAudio();$('panel').classList.remove('hidden');$('card').classList.remove('story-card');
 let selected=trip.route;
 $('card').innerHTML=`<div class="badge">ช่วงที่ ${trip.next/1500} / 6</div><h1>${rested?'เติมพลังแล้ว พร้อมเมื่อไรค่อยไป':'เลือกเส้นทางช่วงถัดไป'}</h1><p>${rested?'หัวใจ '+lives+'/3 • พัสดุยังอยู่ครบ':'ขับผ่านจุดพัก • ไม่ได้รับหัวใจเพิ่ม'}</p><p class="compact">ทั้งสองทางไปถึงเมืองเซลตี้ คะแนนช่วงละ 1,500 เท่ากัน แต่ระยะทางและความถี่ของเหตุการณ์ต่างกัน</p><div class="route-options"><button id="community">🏘️ ทางชุมชน<small>ทางสั้นกว่า • อุปสรรคมากกว่า<br>มองทางแยกและคนข้ามเป็นพิเศษ</small></button><button id="highway">🛣️ ทางสายหลัก<small>ระยะทางประมาณสองเท่า • อุปสรรคน้อยกว่า<br>เว้นระยะจากรถหน้าและรถสวน</small></button></div><div class="row start-row"><button class="primary" id="depart">เริ่มไปต่อเมื่อพร้อม</button><button class="small" id="endTrip">จบรอบและบันทึก</button></div>`;
 const choose=route=>{selected=route;for(const r of ['community','highway'])$(r).classList.toggle('selected',r===route);};choose(selected);$('community').onclick=()=>choose('community');$('highway').onclick=()=>choose('highway');
 $('depart').onclick=()=>{trip.route=selected;trip.station=null;trip.next+=REST_INTERVAL;nextEvent=playerD()+800;nextTraffic=playerD()+600;resumeDriving()};$('endTrip').onclick=()=>finish(false);
}
function arriveAtStation(){const s=trip.station;if(s.final){if(score()<TRIP_LIMIT){s.d=playerD()+650;s.hold=0;s.warned=false;clearStationArea();say('คะแนนยังไม่ครบ 9,000 • ไปช่องส่งพัสดุถัดไปอย่างปลอดภัย',5);return}trip.completed=true;showStory(6,()=>showStory(7,()=>finish(false),'ดูสรุปคะแนน'),'รับคำขอบคุณจากเมืองเซลตี้');return}if(lives<3){lives++;trip.recovered++}showStory(s.index,()=>routeChoice(true),'เลือกเส้นทางและเตรียมไปต่อ')}
const originalUpdateMission=updateMission;
updateMission=function(dt){
 if(!trip){originalUpdateMission(dt);return}const distance=speed*dt;travelled+=distance;trip.distance[trip.route]+=distance;updateMissionText();
 if(!trip.station&&score()>=trip.next)createStation(trip.next===TRIP_LIMIT);
 const s=trip.station;if(!s)return;const a=stationArea(),gap=s.d-playerD();
 if(gap<380&&!s.warned){s.warned=true;say(s.final?'จอดในช่องส่งพัสดุด้านซ้าย • เบรกจนหยุด 2 วินาที':'⛽ เข้าอ่าวจอดด้านซ้าย • เบรกจนหยุด 2 วินาที',6)}
 if(Math.abs(gap)<65&&Math.abs(x-a.x)<34&&speed<2){s.hold+=dt;if(s.hold>=2)arriveAtStation()}else s.hold=0;
 if(gap< -150){if(s.final){s.d=playerD()+650;s.warned=false;clearStationArea();say('ยังไม่ได้ส่งพัสดุ • มีช่องจอดถัดไปด้านซ้าย',5)}else routeChoice(false)}
};
const originalMissionText=updateMissionText;
updateMissionText=function(){if(!trip){originalMissionText();return}const s=trip.station;$('missionInfo').textContent=`📦 เมืองเซลตี้ • ${score().toLocaleString()} / 9,000 • ${trip.route==='community'?'ทางชุมชน':'ทางสายหลัก'}${s?' • จุดจอดอีก '+Math.max(0,Math.ceil(s.d-playerD()))+' ม.':' • จุดพัก '+trip.next.toLocaleString()}`};
const originalSpawnEvent=spawnEvent;
spawnEvent=function(d){if(trip?.station&&Math.abs(d-trip.station.d)<900)return trip.station.d+1000;if(ambulance)return playerD()+1600;return originalSpawnEvent(d)};
const originalSpawnTraffic=spawnTraffic;
spawnTraffic=function(d){if(trip?.station&&Math.abs(d-trip.station.d)<900)return;if(ambulance)return;originalSpawnTraffic(d)};
const originalUpdate=update;
update=function(dt){const wasPlay=mode==='play',beforeNext=nextEvent;originalUpdate(dt);if(!wasPlay||mode!=='play'||tutorial)return;if(trip&&nextEvent!==beforeNext&&!trip.station)nextEvent+=trip.route==='highway'?650:100;if(trip?.station)return;updateAmbulance(dt)};
function updateAmbulance(dt){
 const pd=playerD();if(!ambulance&&pd>nextAmbulance&&!events.some(e=>Math.abs(e.d-pd)<340)&&!cars.some(c=>Math.abs(c.d-pd)<230)){const r=road(pd);ambulance={d:pd-430,t:0,lane:r.lanes===4&&Math.random()<.5?1:0,failed:false,blocked:0,blockedOnce:false};events=events.filter(e=>e.d<pd-200||e.d>pd+1300);cars=cars.filter(c=>Math.abs(c.d-pd)>1700);nextEvent=Math.max(nextEvent,pd+1600);nextTraffic=Math.max(nextTraffic,pd+1700);nextAmbulance=pd+3500+Math.random()*1200;say('🚑 รถพยาบาลมาจากด้านหลัง • '+(r.lanes!==4?'ทางขวาใกล้เส้นกลาง ➡ หลบชิดซ้าย':ambulance.lane===0?'เลนซ้าย ⬅ หลบไปทางขวาในฝั่งเรา':'เลนขวา ➡ หลบชิดซ้าย'),8)}
 const a=ambulance;if(!a)return;a.t+=dt;const cx=laneX(pd,'same',a.lane),gap=a.d-pd;
 // At least five seconds of warning. On a two-lane road it uses the center side,
 // leaving the left side available without asking the rider to enter oncoming traffic.
 const target=road(pd).lanes===4?cx:road(pd).m-18;a.x=target;
 if(a.t<5){a.d=pd-430;return}const blocked=Math.abs(x-target)<43&&gap>-115&&gap< -50;
 if(blocked){a.blocked+=dt;a.d=pd-95;if(a.blocked>2&&!a.blockedOnce){a.blockedOnce=true;a.failed=true;penalty+=25;say('กีดขวางรถพยาบาล • ให้ทางเมื่อปลอดภัย −25',4)}}else a.d+=(speed+65)*dt;
 if(Math.abs(a.d-pd)<50&&Math.abs(x-target)<34&&!a.contacted){a.contacted=true;a.failed=true;collision('ชนรถพยาบาล')}
 if(prefs.sound&&Math.floor(a.t*2)!==a.beat){a.beat=Math.floor(a.t*2);soundCue(a.beat%2?'sirenHi':'sirenLo')}
 if(a.d-pd>270){if(!a.failed){points+=25;stats.safe++;say('ให้ทางรถพยาบาลอย่างปลอดภัย +25',4)}ambulance=null}
}
const originalQueueRound=queueRound;
queueRound=function(result){if(trip){result.version=5;result.route_distance={community:Math.floor(trip.distance.community),highway:Math.floor(trip.distance.highway)};result.recovered=trip.recovered;result.trip_completed=trip.completed}originalQueueRound(result)};
const originalFinish=finish;
finish=function(delivered=false){$('card').classList.remove('story-card');originalFinish(delivered);if(trip?.completed){const title=$('card').querySelector('h1');if(title)title.textContent='ส่งถึงเซลตี้ • '+score()+' คะแนน'}if($('again'))$('again').onclick=()=>{if(delivered&&selectedStage<5)selectedStage++;unlockAudio();reset(false)}};
const originalDrawDelivery=drawDelivery;
drawDelivery=function(){originalDrawDelivery();const a=stationArea();if(!a)return;const y=sy(a.d);if(y< -240||y>H+260)return;rr(a.x-a.w/2,y-a.h/2,a.w,a.h,10,'#315f69');g.strokeStyle='#fff4b7';g.lineWidth=3;g.strokeRect(a.x-a.w/2+8,y-a.h/2+8,a.w-16,a.h-16);rr(a.x-a.w/2,y-120,a.w,30,6,'#ffcf65');g.textAlign='center';g.font='bold 13px sans-serif';g.fillStyle='#173039';g.fillText(trip.station.final?'📦 ส่งพัสดุ':'⛽ พัก +1 ♥',a.x,y-100);g.fillStyle='#fff';g.fillText('หยุด 2 วินาที',a.x,y+10);if(trip.station.hold>0){g.fillStyle='#ffcf65';g.fillRect(a.x-a.w/2,y+a.h/2+5,a.w*clamp(trip.station.hold/2,0,1),7)}};
const originalDraw=draw;
draw=function(){$('hudScore').textContent='คะแนน '+score().toLocaleString();$('hudLives').textContent='ชีวิต '+lives+'/3 • '+Math.round(speed*.32)+' กม./ชม. • ระดับ '+(1+Math.floor(difficulty()*5));originalDraw();if(ambulance){const a=ambulance;car(a.x||laneX(playerD(),'same',a.lane),sy(a.d),'#f0f3e7',false,false,false,true);const y=sy(a.d);rr((a.x||x)-18,y-34,36,8,2,Math.floor(time*8)%2?'#f14155':'#4da4ff');g.textAlign='center';g.font='bold 24px sans-serif';g.fillStyle='#ed4058';g.fillText('+',a.x||x,y+12);if(a.d<playerD()-150){rr(W/2-150,H-130,300,35,10,'#132e40f5');g.fillStyle='#ffdc75';g.font='bold 15px sans-serif';g.fillText('🚑 ด้านหลัง '+(road(playerD()).lanes===4?(a.lane===0?'⬅ เลนซ้าย':'➡ เลนขวา'):'➡ ชิดเส้นกลาง • หลบซ้าย'),W/2,H-108)}}};
const originalPerson=person;
person=function(px,py,t){if(!trip||score()<=4000){originalPerson(px,py,t);return}g.save();g.translate(px,py);const step=Math.sin(t*10)*5;line(-3,9,-5,21+step,'#705dac',4);line(3,9,5,21-step,'#705dac',4);rr(-8,-2,16,15,5,'#e8ad57');ellipse(0,-10,11,13,'#8fdfbf');ellipse(-4,-11,3,5,'#243843');ellipse(4,-11,3,5,'#243843');line(-3,-4,3,-4,'#315951',1);g.restore()};
const originalCar=car;
car=function(cx,cy,color,reverse=false,braking=false,blink=false,truck=false,angle=0,blinkSide=-1){originalCar(cx,cy,color,reverse,braking,blink,truck,angle,blinkSide);if(trip&&score()>5500&&!truck){g.save();g.translate(cx,cy);g.rotate(angle);ellipse(0,-7,15,9,'#91dedac0');line(-22,4,-18,4,'#bbf3f0',3);line(18,4,22,4,'#bbf3f0',3);g.restore()}};
const originalAtmosphere=atmosphere;
atmosphere=function(){originalAtmosphere();if(!trip||score()<=4000)return;const u=mod(time*25+150,W+200)-100;ellipse(u,40,30,9,'#c4ace3');ellipse(u,34,15,9,'#8cd3d5');for(let i=0;i<3;i++)ellipse(u-15+i*15,41,3,2,'#ffda6c')};
const originalDrawClues=drawClues;
drawClues=function(){originalDrawClues();for(const e of events){const gap=e.d-playerD(),y=sy(e.d),r=road(e.d);if(gap<100||gap>H*.75)continue;if(['rightturn','oncoming','uturn','junction','merge','door','school'].includes(e.kind)){rr(r.left+5,y+95,25,25,4,'#ffcf65');g.textAlign='center';g.fillStyle='#182d37';g.font='bold 20px sans-serif';g.fillText('!',r.left+18,y+115)}if(trip&&score()>4000&&e.kind==='broken'){ellipse(laneX(e.d,'same'),y,33,36,'#423746');ellipse(laneX(e.d,'same')-5,y-6,15,14,'#e68647');line(r.right+20,y-135,r.right+50,y-170,'#ffc577',4);if(e.state==='active'&&!e.meteorWarned){e.meteorWarned=true;say('☄️ รอยอุกกาบาตข้างหน้า • ไม่กดเร่งขณะผ่าน',5)}}}};
