(function(root){
'use strict';
function createLocator({geolocation,getMap,leaflet,setState,secure=true}){
 let pending=false,marker=null,accuracyCircle=null;
 return function locate(){
  if(pending)return;
  if(!secure){setState(false,'ต้องเปิดเว็บผ่าน HTTPS เพื่อใช้ตำแหน่ง');return;}
  if(!geolocation){setState(false,'เบราว์เซอร์นี้ไม่รองรับตำแหน่งของฉัน');return;}
  pending=true;setState(true,'กำลังค้นหาตำแหน่งของคุณ…');
  const fail=error=>{pending=false;const messages={1:'ยังไม่ได้อนุญาตตำแหน่ง กรุณาอนุญาตในเบราว์เซอร์แล้วลองใหม่',2:'ยังหาตำแหน่งไม่ได้ ลองเปิด GPS แล้วกดอีกครั้ง',3:'ค้นหาตำแหน่งนานเกินไป กรุณาลองใหม่'};setState(false,messages[error?.code]||'ค้นหาตำแหน่งไม่สำเร็จ กรุณาลองใหม่');};
  try{geolocation.getCurrentPosition(position=>{
   try{
    const {latitude:lat,longitude:lng,accuracy}=position.coords;
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)throw Error('invalid location');
    const map=getMap(),point=[lat,lng],radius=Number.isFinite(accuracy)&&accuracy>0?accuracy:0;
    if(marker)marker.remove();if(accuracyCircle)accuracyCircle.remove();
    accuracyCircle=leaflet.circle(point,{radius,color:'#1976d2',weight:1,fillColor:'#42a5f5',fillOpacity:.12,interactive:false}).addTo(map);
    marker=leaflet.circleMarker(point,{radius:8,color:'#fff',weight:3,fillColor:'#1565c0',fillOpacity:1}).addTo(map).bindPopup('📍 ตำแหน่งของฉัน');
    if(radius>1000)map.fitBounds(accuracyCircle.getBounds(),{maxZoom:16,padding:[35,35]});else map.setView(point,16);
    pending=false;setState(false,radius?'พบตำแหน่ง • ความแม่นยำประมาณ '+Math.round(radius).toLocaleString('th-TH')+' เมตร':'พบตำแหน่งของคุณแล้ว');
   }catch(_){fail();}
  },fail,{enableHighAccuracy:true,timeout:15000,maximumAge:30000});}catch(_){fail();}
 };
}
if(typeof module!=='undefined'&&module.exports){module.exports={createLocator};return;}
const $=id=>document.getElementById(id),storageKey='road-sharky-dismissed-v1';
function setMascot(hidden){
 const friend=$('sharkyFriend'),restore=$('restoreSharky');
 if(friend)friend.hidden=hidden;if(restore)restore.hidden=!hidden;
 try{if(hidden)localStorage.setItem(storageKey,'1');else localStorage.removeItem(storageKey);}catch(_){}
}
root.closeSharky=()=>setMascot(true);
root.restoreSharky=()=>setMascot(false);
root.locateIncidentPosition=createLocator({
 geolocation:navigator.geolocation,secure:root.isSecureContext,
 getMap:()=>{ensureIncidentMap();return incidentMap;},leaflet:root.L,
 setState:(busy,text)=>{const button=$('incidentLocateBtn'),status=$('incidentLocationStatus');if(button){button.disabled=busy;button.setAttribute('aria-busy',String(busy));button.textContent=busy?'⏳ กำลังค้นหา…':'📍 ตำแหน่งของฉัน';}if(status){status.hidden=false;status.textContent=text;}}
});
let layoutQueued=false;
function updateLayout(){
 if(layoutQueued)return;layoutQueued=true;
 requestAnimationFrame(()=>{
  layoutQueued=false;const mobile=matchMedia('(max-width:900px)').matches;
  if(document.body.classList.contains('mobile-layout')!==mobile)document.body.classList.toggle('mobile-layout',mobile);
  const header=document.querySelector('.topbar'),nav=document.querySelector('.bottom-kawaii');
  const navHeight=nav&&getComputedStyle(nav).display!=='none'?nav.getBoundingClientRect().height:0;
  document.documentElement.style.setProperty('--app-topbar-height',(header?.getBoundingClientRect().height||52)+'px');
  document.documentElement.style.setProperty('--app-bottom-nav-height',navHeight+'px');
  if(document.body.classList.contains('incident-map-active')&&typeof incidentMap!=='undefined'&&incidentMap)incidentMap.invalidateSize({pan:false});
 });
}
document.addEventListener('DOMContentLoaded',()=>{
 try{setMascot(localStorage.getItem(storageKey)==='1');}catch(_){}
 const header=document.querySelector('.topbar'),nav=document.querySelector('.bottom-kawaii');
 if(root.ResizeObserver){const observer=new ResizeObserver(updateLayout);if(header)observer.observe(header);if(nav)observer.observe(nav);}
 new MutationObserver(updateLayout).observe(document.body,{attributes:true,attributeFilter:['class']});
 root.addEventListener('resize',updateLayout);root.visualViewport?.addEventListener('resize',updateLayout);updateLayout();
});
})(typeof window!=='undefined'?window:globalThis);
