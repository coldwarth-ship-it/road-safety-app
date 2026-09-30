'use strict';
// Official layers are independent of community approval and report counters.
(function(){
 let started=false;
 function start(){
  if(started||!window.L||typeof map==='undefined'||!map)return;started=true;
  const enabled={earthquake:false,flood:false,water:false},stores={},requests={},versions={earthquake:0,flood:0,water:0},lastFetch={},states={};
  const groups={earthquake:L.layerGroup(),water:L.layerGroup()};let floodLayer=null,floodTimer;
  const names={earthquake:'แผ่นดินไหว · กรมอุตุนิยมวิทยา',flood:'น้ำท่วมดาวเทียม · GISTDA',water:'ระดับน้ำ / ฝน · ThaiWater'};
  const sourceUrls={earthquake:'https://earthquake.tmd.go.th/',flood:'https://disaster.gistda.or.th/services/open-api',water:'https://www.thaiwater.net/'};
  const style=document.createElement('style');style.textContent='.official-control{background:white;color:#243744;border-radius:14px;box-shadow:0 4px 22px #0002;width:290px;padding:12px;font:13px "Noto Sans Thai",sans-serif;max-height:60vh;overflow:auto}.official-control summary{cursor:pointer;font-weight:600}.official-control label{display:flex;gap:8px;align-items:center;padding-top:10px}.official-control input{width:16px;height:16px}.official-control small{display:block;color:#64748b;font-size:11px;line-height:1.5;margin:4px 0}.official-control a{color:#1769aa}.official-control button{background:#f0f5fa;border:1px solid #d4dfe8;border-radius:8px;padding:7px;margin-top:8px;cursor:pointer}.official-popup{line-height:1.65;max-width:260px}.official-popup p{margin:4px 0}.official-control .official-error{color:#b45309}@media(max-width:680px){.official-control{width:235px;max-height:45vh}.leaflet-top.leaflet-right:has(.official-control){top:140px}}';document.head.append(style);
  style.textContent+=' .leaflet-top.leaflet-right:has(.official-control){top:140px}@media(min-width:681px){.official-control{width:min(290px,calc(100vw - 450px))}}';
  function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function time(value){if(!value)return 'ไม่ระบุ';const d=new Date(value);return Number.isNaN(+d)?'ไม่ระบุ':d.toLocaleString('th-TH',{dateStyle:'short',timeStyle:'short'});}
  function setStatus(key,text,error=false){states[key].textContent=text;states[key].classList.toggle('official-error',error);}
  const control=L.control({position:'topright'});control.onAdd=()=>{
   const box=node('details',undefined,'official-control'),summary=node('summary','ชั้นข้อมูลทางการ');summary.onclick=e=>{e.preventDefault();box.open=!box.open;};box.append(summary);
   box.append(node('small','เปิดชั้นที่ต้องการ ข้อมูลตามกรอบแผนที่ แยกจากตัวกรองรายงานชุมชน'));
   const community=node('label'),communityInput=node('input');communityInput.type='checkbox';communityInput.checked=true;community.append(communityInput,node('span','รายงานประชาชน'));communityInput.onchange=()=>{if(communityInput.checked)layer.addTo(map);else map.removeLayer(layer);};box.append(community);
   for(const key of Object.keys(names)){const label=node('label'),input=node('input');input.type='checkbox';input.setAttribute('aria-label',names[key]);label.append(input,node('span',names[key]));box.append(label);states[key]=node('small','ยังไม่เปิดชั้นข้อมูล');states[key].setAttribute('role','status');box.append(states[key]);const link=node('a','เว็บไซต์ต้นทาง');link.href=sourceUrls[key];link.target='_blank';link.rel='noopener noreferrer';box.append(link);
    input.onchange=()=>{enabled[key]=input.checked;versions[key]++;requests[key]?.abort();if(!input.checked){if(key==='flood'){if(floodLayer)map.removeLayer(floodLayer);floodLayer=null;clearTimeout(floodTimer);}else map.removeLayer(groups[key]);setStatus(key,'ปิดชั้นข้อมูล');return;}if(key!=='flood')groups[key].addTo(map);load(key,true);};
   }
   const reload=node('button','ตรวจข้อมูลใหม่');reload.type='button';reload.onclick=()=>Object.keys(enabled).filter(k=>enabled[k]).forEach(k=>load(k,true));box.append(node('br'),reload,node('small','แผ่นดินไหว/สถานีตรวจทุก 5 นาทีขณะเปิดหน้าเว็บ น้ำท่วมตามรอบดาวเทียม; พื้นที่ไม่มีสีไม่ได้ยืนยันว่าปลอดภัย'));
   L.DomEvent.disableClickPropagation(box);L.DomEvent.disableScrollPropagation(box);return box;
  };control.addTo(map);
  function popup(key,item){const box=node('div',undefined,'official-popup');box.append(node('strong',item.title||names[key]));const lines=key==='earthquake'?['ขนาด '+(item.magnitude??'ไม่ระบุ'),'ความลึก '+(item.depthKm??'ไม่ระบุ')+' กม.','เกิดเหตุ '+time(item.observedAt),'ประกาศ '+time(item.publishedAt)]:['ตรวจวัด '+time(item.observedAt),...(item.waterLevelM==null?[]:['ระดับน้ำ '+item.waterLevelM+' เมตร ('+item.datum+')']),...(item.rainMm==null?[]:['ฝน '+item.rainMm+' มม. · '+item.rainPeriod]),'ระดับน้ำสถานีไม่ใช่ความลึกน้ำท่วมถนน'];
   for(const text of lines)box.append(node('p',text));box.append(node('small','ดึงข้อมูล '+time(stores[key]?.fetchedAt)));
   const link=node('a','ตรวจข้อมูลต้นทาง');let url=sourceUrls[key];try{const u=new URL(item.url);if(u.protocol==='https:'&&u.hostname==='earthquake.tmd.go.th')url=u.href;}catch{}link.href=url;link.target='_blank';link.rel='noopener noreferrer';box.append(node('br'),link);return box;
  }
  function draw(key,rebuild=true){if(rebuild)groups[key].clearLayers();if(!enabled[key])return;const bounds=map.getBounds();let count=0;for(const item of stores[key]?.items||[]){if(!Number.isFinite(item.lat)||!Number.isFinite(item.lng))continue;if(bounds.contains([item.lat,item.lng]))count++;if(!rebuild)continue;const marker=L.circleMarker([item.lat,item.lng],{radius:key==='earthquake'?7:5,color:key==='earthquake'?'#7c3aed':'#0369a1',weight:2,fillColor:key==='earthquake'?'#a78bfa':'#38bdf8',fillOpacity:.8});marker.bindPopup(popup(key,item));marker.bindTooltip(node('span',item.title||names[key]));groups[key].addLayer(marker);}
   const data=stores[key];if(!data)return;const stale=data.status!=='ok'||data.stale||!data.fetchedAt||Date.now()-Date.parse(data.fetchedAt)>15*60000;
   setStatus(key,(stale?'ข้อมูลเดิม/ขัดข้อง · ':'')+count+' จุดในกรอบแผนที่ · ดึง '+time(data.fetchedAt)+(data.message?' · '+data.message:''),stale);
  }
  function floodBounds(){const b=map.getBounds();const west=Math.max(97,Math.floor(b.getWest()*10)/10),south=Math.max(5,Math.floor(b.getSouth()*10)/10),east=Math.min(106,Math.ceil(b.getEast()*10)/10),north=Math.min(21,Math.ceil(b.getNorth()*10)/10);return west<east&&south<north?[west,south,east,north]:null;}
  async function load(key,force=false){if(!enabled[key]||document.hidden)return;if(!force&&Date.now()-(lastFetch[key]||0)<(key==='flood'?3600000:300000))return;
   if(!window.DISASTER_CONFIG?.apiUrl){setStatus(key,'รอตั้งค่า URL Apps Script ของเว็บนี้',true);return;}
   const version=++versions[key];requests[key]?.abort();const controller=new AbortController();requests[key]=controller;const timeout=setTimeout(()=>controller.abort(),30000);
   let b;try{const url=new URL(window.DISASTER_CONFIG.apiUrl);url.searchParams.set('official',key);if(key==='flood'){b=floodBounds();if(!b){setStatus(key,'กรอบแผนที่อยู่นอกขอบเขตประเทศไทย');if(floodLayer)map.removeLayer(floodLayer);floodLayer=null;return;}url.searchParams.set('bbox',b.join(','));}
    setStatus(key,'กำลังโหลดข้อมูลทางการ…');const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('HTTP');const data=await response.json();if(version!==versions[key]||!enabled[key])return;
    if(!Object.prototype.hasOwnProperty.call(data,'items')&&key!=='flood'&&data.status==='ok'){setStatus(key,'ต้องเพิ่ม OfficialData.gs และแก้ doGet ก่อน Deploy รุ่นใหม่',true);return;}
    if(['needs_configuration','setup_required','pending','busy'].includes(data.status)){setStatus(key,data.message||'รอผู้ดูแลตั้งค่าแหล่งข้อมูล',true);return;}
    if(key==='flood'){
     if(data.status!=='ok'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data.image||'')||JSON.stringify(data.bbox)!==JSON.stringify(b))throw Error('flood');
     if(floodLayer)map.removeLayer(floodLayer);floodLayer=L.imageOverlay(data.image,[[b[1],b[0]],[b[3],b[2]]],{opacity:.6,attribution:'พื้นที่น้ำท่วม © GISTDA'}).addTo(map);
     setStatus(key,'รับภาพย้อนหลัง 1 วัน · ดึง '+time(data.fetchedAt)+' · ยังไม่ยืนยันพื้นที่น้ำท่วมในภาพ/เวลาสำรวจ');
    }else{if(!Array.isArray(data.items))throw Error('schema');stores[key]=data;draw(key);}lastFetch[key]=Date.now();
   }catch(error){if(version!==versions[key]||!enabled[key])return;if(key!=='flood'&&stores[key]){stores[key].status='error';stores[key].message='โหลดครั้งใหม่ไม่สำเร็จ';draw(key);}else setStatus(key,key==='flood'?'โหลดภาพน้ำท่วมไม่ได้ · ภาพเดิมถ้ามีไม่ใช่ข้อมูลล่าสุด':'โหลดไม่ได้ กรุณาตรวจการติดตั้งหลังบ้านหรืออินเทอร์เน็ต',true);
   }finally{clearTimeout(timeout);}
  }
  map.on('moveend',()=>{for(const key of ['earthquake','water'])draw(key,false);if(enabled.flood){clearTimeout(floodTimer);floodTimer=setTimeout(()=>load('flood',true),1200);}});
  setInterval(()=>{for(const key of Object.keys(enabled))load(key);},300000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)for(const key of Object.keys(enabled))load(key);});
 }
 window.addEventListener('disaster-ready',start,{once:true});if(typeof map!=='undefined'&&map&&typeof regions!=='undefined'&&regions.length)start();
})();
