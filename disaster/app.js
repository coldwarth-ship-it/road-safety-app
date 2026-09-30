'use strict';
const $=id=>document.getElementById(id);
const config=window.DISASTER_CONFIG||{};
const demo=!config.apiUrl;
const severityText={critical:'รุนแรง',watch:'เฝ้าระวัง',resolved:'คลี่คลาย'};
const typeText={flood:'น้ำท่วม',quake:'แผ่นดินไหว'};
const accessText={blocked:'ไม่สามารถผ่านได้',limited:'ผ่านได้จำกัด',open:'ผู้แจ้งระบุว่าผ่านได้',unknown:'ยังไม่ทราบ'};
let regions=[],records=[],map,layer,pin,picking=false,selectedId='',type='all',severity='all',photo='',requestId='',busy=false;
let toastTimer,fetchVersion=0;
let boundaryLayer,boundaryPromise,boundaryName="",boundaryVersion=0;
const samples=[
 ['DEMO-01','flood','critical','น้ำท่วมถนนในชุมชน','เชียงราย','เมืองเชียงราย',19.91,99.83,60,'blocked','ตัวอย่างรายงาน: มีน้ำท่วมขังบนถนนในชุมชน ไม่ใช่เหตุการณ์จริง'],
 ['DEMO-02','flood','watch','เฝ้าระวังระดับน้ำริมคลอง','กรุงเทพมหานคร','เขตบางเขน',13.87,100.60,20,'limited','ตัวอย่างรายงาน: ระดับน้ำเพิ่มขึ้นในช่วงฝนตก ไม่ใช่เหตุการณ์จริง'],
 ['DEMO-03','quake','watch','รายงานรอยร้าวผนังอาคาร','เชียงใหม่','เมืองเชียงใหม่',18.79,98.98,null,'unknown','ตัวอย่างรายงานผลกระทบ ไม่ใช่ผลประเมินความปลอดภัยของอาคาร'],
 ['DEMO-04','flood','critical','น้ำท่วมบริเวณถนนเข้าหมู่บ้าน','อุบลราชธานี','วารินชำราบ',15.19,104.87,80,'blocked','ตัวอย่างรายงาน: ถนนบางช่วงมีน้ำท่วม ไม่ใช่เหตุการณ์จริง'],
 ['DEMO-05','flood','resolved','ระดับน้ำในพื้นที่ลดลง','ระยอง','บ้านค่าย',12.78,101.29,5,'open','ตัวอย่างรายงาน: น้ำลดลง แต่ควรตรวจสอบสภาพถนนก่อนเดินทาง'],
 ['DEMO-06','quake','watch','ประชาชนรายงานรู้สึกถึงแรงสั่น','ตาก','แม่สอด',16.71,98.57,null,'unknown','ตัวอย่างข้อมูลจากผู้แจ้ง ไม่ใช่ข้อมูลขนาดแผ่นดินไหวจากเครื่องตรวจวัด'],
 ['DEMO-07','flood','watch','น้ำขังบริเวณทางลอด','สงขลา','หาดใหญ่',7.01,100.47,25,'limited','ตัวอย่างรายงานเพื่อทดลองหน้าจอเท่านั้น'],
 ['DEMO-08','flood','resolved','ชุมชนรายงานน้ำเริ่มลด','พระนครศรีอยุธยา','พระนครศรีอยุธยา',14.35,100.57,10,'limited','ตัวอย่างข้อมูล ไม่ยืนยันว่าเส้นทางปลอดภัย']
].map((r,i)=>({id:r[0],type:r[1],severity:r[2],title:r[3],province:r[4],district:r[5],lat:r[6],lng:r[7],waterCm:r[8],access:r[9],description:r[10],createdAt:new Date(Date.now()-(i+1)*37*60000).toISOString(),imageUrl:'',demo:true}));
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function dateText(value){const d=new Date(value);return Number.isNaN(+d)?'ไม่ระบุเวลา':d.toLocaleString('th-TH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
function filtered(){const q=$('searchInput').value.trim().toLowerCase(),p=$('provinceFilter').value;return records.filter(r=>(!p||r.province===p)&&(type==='all'||r.type===type)&&(severity==='all'||r.severity===severity)&&(!q||[r.title,r.province,r.district].join(' ').toLowerCase().includes(q)));}
function validRecord(r){return r&&typeof r.id==='string'&&typeof r.title==='string'&&typeText[r.type]&&severityText[r.severity]&&Number.isFinite(r.lat)&&Number.isFinite(r.lng)&&r.lat>=5.5&&r.lat<=20.6&&r.lng>=97.3&&r.lng<=105.7;}
function render(fit=false){$('provinceFilter').syncProvinceSearch?.();const rows=filtered();$('count').textContent=rows.length;const list=$('reportList');list.replaceChildren();if(layer)layer.clearLayers();
 if(!rows.length){const empty=el('div','empty');empty.append(el('strong','','ยังไม่มีรายงานในพื้นที่นี้'),el('p','','ลองเลือกจังหวัดหรือระดับสถานการณ์อื่น'));list.append(empty);}
 for(const r of rows){const card=el('button','report-card'+(selectedId===r.id?' selected':''));card.type='button';const top=el('div','card-top');top.append(el('span','badge '+r.severity,severityText[r.severity]),el('small','',typeText[r.type]));card.append(top,el('h3','',r.title),el('div','card-location',r.district+' · '+r.province));const bottom=el('div','card-bottom');bottom.append(el('span','',r.type==='flood'&&r.waterCm!==null?'ระดับน้ำ '+r.waterCm+' ซม.':'ข้อมูลจากผู้แจ้ง'),el('span','',dateText(r.createdAt)));card.append(bottom);card.onclick=()=>showDetail(r.id);list.append(card);
  if(layer){const marker=L.marker([r.lat,r.lng],{icon:L.divIcon({className:'risk-marker',html:'<span class="marker-dot '+r.severity+'">'+(r.type==='flood'?'≋':'ϟ')+'</span>',iconSize:[26,26],iconAnchor:[13,13]}),title:r.title});marker.bindTooltip(el('span','',r.title),{direction:'top'}).on('click',()=>showDetail(r.id));layer.addLayer(marker);}
 }
 if(fit&&map){if($('provinceFilter').value){void showProvinceBoundary(true);return;}void showProvinceBoundary(false);if(rows.length)map.fitBounds(rows.map(r=>[r.lat,r.lng]),{paddingTopLeft:innerWidth>680?[420,130]:[35,155],paddingBottomRight:[60,130],maxZoom:12});else countryView();}
}

async function showProvinceBoundary(fit=true){
 const version=++boundaryVersion,name=$('provinceFilter').value;
 const status=$('boundaryStatus');
 if(boundaryLayer&&boundaryName!==name){map.removeLayer(boundaryLayer);boundaryLayer=null;boundaryName='';}
 if(!name){status.hidden=true;if(fit)countryView();return;}
 if(!map)return;
 status.hidden=false;status.textContent='กำลังโหลดขอบเขต '+name+'…';
 try{
  if(!boundaryPromise)boundaryPromise=fetch('province-boundaries.json').then(response=>{if(!response.ok)throw Error();return response.json();}).then(data=>{if(data.type!=='FeatureCollection'||data.features?.length!==77)throw Error();return data;}).catch(error=>{boundaryPromise=null;throw error;});
  const data=await boundaryPromise;
  if(version!==boundaryVersion)return;
  const feature=data.features.find(f=>f.properties.name_th===name);if(!feature)throw Error();
  if(!boundaryLayer){boundaryLayer=L.geoJSON(feature,{renderer:L.svg(),interactive:false,style:{color:'#2563eb',weight:2.5,fillColor:'#60a5fa',fillOpacity:.08,className:'province-boundary'},attribution:'ขอบเขต: <a href="https://www.geoboundaries.org/">geoBoundaries</a> / <a href="https://www.openstreetmap.org/copyright">OSM (ODbL)</a>'}).addTo(map);boundaryName=name;}
  status.textContent='ขอบเขตจังหวัด'+name;
  if(fit)map.fitBounds(boundaryLayer.getBounds(),{paddingTopLeft:innerWidth>680?[420,130]:[25,160],paddingBottomRight:[60,130],maxZoom:12});
 }catch{if(version!==boundaryVersion)return;status.textContent='โหลดขอบเขตไม่ได้ · เลือกจังหวัดอีกครั้งเพื่อลองใหม่';if(fit)countryView();}
}

function countryView(){if(map)map.fitBounds([[5.5,97.3],[20.6,105.7]],{paddingTopLeft:innerWidth>680?[420,100]:[20,150],paddingBottomRight:[50,100]});}
function closeDetail(){$('detailPanel').hidden=true;selectedId='';render();}
function safeImage(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:'';}catch{return '';}}
function showDetail(id){const r=records.find(x=>x.id===id);if(!r)return;selectedId=id;const host=$('detailPanel');host.replaceChildren();const head=el('div','detail-head');head.append(el('span','badge '+r.severity,severityText[r.severity]));const close=el('button','icon-btn','×');close.setAttribute('aria-label','ปิดรายละเอียด');close.onclick=closeDetail;head.append(close);host.append(head,el('div','eyebrow',typeText[r.type]),el('h2','',r.title),el('p','muted',r.district+' · '+r.province));
 const stats=el('div','detail-stats');for(const [k,v] of [[r.type==='flood'?'ระดับน้ำโดยประมาณ':'ประเภทผลกระทบ',r.type==='flood'?(r.waterCm===null?'ไม่ระบุ':r.waterCm+' ซม.'):'ตามรายงานผู้แจ้ง'],['การสัญจร',accessText[r.access]||'ไม่ระบุ']]){const box=el('div');box.append(el('small','',k),el('strong','',v));stats.append(box);}host.append(stats);
 const src=safeImage(r.imageUrl);if(src){const img=el('img','detail-photo');img.src=src;img.alt='ภาพประกอบ '+r.title;img.onerror=()=>{img.replaceWith(el('p','muted','ไม่สามารถโหลดรูปประกอบได้'));};host.append(img);}host.append(el('p','detail-copy',r.description));
 const actions=el('div','detail-actions');const nav=el('a','secondary','เปิดตำแหน่ง');nav.href='https://www.google.com/maps/search/?api=1&query='+r.lat+','+r.lng;nav.target='_blank';nav.rel='noopener noreferrer';const share=el('button','secondary','แชร์พื้นที่');share.onclick=async()=>{const u=new URL(location.href);u.hash='report='+encodeURIComponent(r.id);try{await navigator.clipboard.writeText(u.href);toast('คัดลอกลิงก์แล้ว');}catch{toast('คัดลอกลิงก์จากแถบที่อยู่ได้เลย');location.hash=u.hash;}};actions.append(nav,share);host.append(actions,el('div','detail-meta','แจ้งเมื่อ '+dateText(r.createdAt)+'\nเลขรายงาน '+r.id),el('p','form-notice',r.demo?'ข้อมูลตัวอย่าง ไม่ใช่เหตุการณ์จริง':'ข้อมูลจากผู้แจ้ง ไม่ใช่การยืนยันความปลอดภัยของพื้นที่'));host.hidden=false;render();if(map)map.setView([r.lat,r.lng],Math.max(map.getZoom(),11));}
async function load(){const version=++fetchVersion;$('refreshBtn').disabled=true;try{if(demo)records=samples;else{const response=await fetch(config.apiUrl);if(!response.ok)throw Error('ไม่สามารถโหลดรายงานได้');const body=await response.json();if(body.status!=='ok'||!Array.isArray(body.data))throw Error(body.message||'ข้อมูลตอบกลับไม่ถูกต้อง');if(version!==fetchVersion)return;records=body.data.filter(validRecord);}render();$('updateTime').textContent='อัปเดต '+new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});if(location.hash.startsWith('#report='))showDetail(decodeURIComponent(location.hash.slice(8)));}catch(error){$('updateTime').textContent='โหลดไม่สำเร็จ';if(!records.length){$('reportList').replaceChildren(el('div','empty','โหลดข้อมูลไม่ได้ กรุณากด ↻ เพื่อลองใหม่'));}toast(error.message);}finally{$('refreshBtn').disabled=false;}}
function fillDistricts(){const target=$('reportDistrict');target.replaceChildren(new Option('เลือกอำเภอ / เขต',''));const region=regions.find(p=>p.name===$('reportProvince').value);for(const d of region?.districts||[])target.add(new Option(d,d));}
function openReport(){closeDetail();$('sidebar').classList.remove('mobile-open');$('formError').textContent='';if(!regions.length){toast('ข้อมูลจังหวัดยังไม่พร้อม กรุณาโหลดหน้าใหม่');return;}if(!$('reportProvince').value&&$('provinceFilter').value){$('reportProvince').value=$('provinceFilter').value;fillDistricts();}$('reportDialog').showModal();}

// Coordinates are matched locally against bundled district geometry.
'use strict';
function dwInRing(point,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(((a[1]>point[1])!==(b[1]>point[1]))&&(point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]))inside=!inside;}return inside;}
function dwInGeometry(point,geometry){const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;return polygons.some(p=>dwInRing(point,p[0])&&!p.slice(1).some(h=>dwInRing(point,h)));}
function dwBounds(geometry){const points=geometry.coordinates.flat(geometry.type==='Polygon'?1:2);return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];}
function dwFindArea(features,lat,lng){const point=[lng,lat];return features.filter(f=>{const b=f.bbox;return (!b||(lng>=b[0]&&lat>=b[1]&&lng<=b[2]&&lat<=b[3]))&&dwInGeometry(point,f.geometry);});}


let areaDataPromise,areaVersion=0,areaTimer;
function areaStatus(message){let n=$('areaStatus');if(!n){n=el('p','full muted');n.id='areaStatus';n.setAttribute('role','status');n.style.fontSize='12px';document.querySelector('.location-actions').after(n);}n.textContent=message;}
function cancelAreaLookup(message='เลือกจังหวัดและอำเภอด้วยตนเองแล้ว'){areaVersion++;clearTimeout(areaTimer);areaStatus(message);}
async function fillAreaFromCoords(lat,lng){
 const version=++areaVersion;clearTimeout(areaTimer);
 $('reportProvince').value='';fillDistricts();areaStatus('กำลังหาจังหวัดและอำเภอจากพิกัด…');
 try{
  if(!areaDataPromise)areaDataPromise=(async()=>{const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);try{const response=await fetch('district-boundaries.json',{signal:controller.signal});if(!response.ok)throw Error('Unavailable');const data=await response.json();if(data.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error('Invalid');return data.features;}finally{clearTimeout(timeout);}})().catch(error=>{areaDataPromise=null;throw error;});
  const features=await areaDataPromise;
  if(version!==areaVersion||Number($('latInput').value)!==lat||Number($('lngInput').value)!==lng)return;
  const matches=dwFindArea(features,lat,lng),provinces=[...new Set(matches.map(f=>f.properties.province).filter(Boolean))];
  const province=provinces.length===1?regions.find(p=>p.name===provinces[0]):null;
  if(!province){areaStatus('ไม่พบพื้นที่หรืออยู่ใกล้รอยต่อ กรุณาเลือกจังหวัดและอำเภอเอง');return;}
  $('reportProvince').value=province.name;fillDistricts();
  const districts=[...new Set(matches.map(f=>f.properties.district))];
  if(districts.length===1&&province.districts.includes(districts[0])){$('reportDistrict').value=districts[0];areaStatus('เติมพื้นที่แล้ว: '+districts[0]+' · '+province.name+' — กรุณาตรวจสอบก่อนส่ง แก้ไขเองได้');}
  else areaStatus('พบจังหวัด'+province.name+' กรุณาเลือกอำเภอ/เขตเอง เนื่องจากขอบเขตระบุได้ไม่ชัดเจน');
 }catch{if(version===areaVersion)areaStatus('โหลดข้อมูลพื้นที่ไม่สำเร็จ กรุณาเลือกจังหวัดและอำเภอเอง หรือเลือกพิกัดอีกครั้ง');}
}
function installAreaLookup(){
 areaStatus('เลือกพิกัดเพื่อเติมจังหวัดและอำเภออัตโนมัติ ตรวจจากขอบเขตอ้างอิงปี 2019');
 const credit=el('a','','ข้อมูลขอบเขต: geoBoundaries / RTSD / OCHA (CC BY 3.0 IGO)');credit.href='https://www.geoboundaries.org/api/current/gbOpen/THA/ADM2/';credit.target='_blank';credit.rel='noopener noreferrer';credit.style.fontSize='10px';credit.className='full';$('areaStatus').after(credit);
 $('reportProvince').addEventListener('change',()=>cancelAreaLookup());$('reportDistrict').addEventListener('change',()=>cancelAreaLookup());
 for(const id of ['latInput','lngInput'])$(id).addEventListener('input',()=>{cancelAreaLookup('พิกัดเปลี่ยนแล้ว กำลังรอกรอกให้ครบ…');$('reportProvince').value='';fillDistricts();areaTimer=setTimeout(()=>{const a=$('latInput'),b=$('lngInput');if(a.value&&b.value&&a.checkValidity()&&b.checkValidity())setCoords(Number(a.value),Number(b.value));else areaStatus('กรุณากรอกพิกัดให้ครบและอยู่ในช่วงที่กำหนด');},700);});
 $('reportForm').addEventListener('reset',()=>cancelAreaLookup('เลือกพิกัดเพื่อเติมจังหวัดและอำเภออัตโนมัติ'));
}

function setCoords(lat,lng){if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<5.5||lat>20.6||lng<97.3||lng>105.7){toast('ตำแหน่งอยู่นอกบริเวณประเทศไทย');return false;}$('latInput').value=lat.toFixed(6);$('lngInput').value=lng.toFixed(6);if(map){if(pin)pin.setLatLng([lat,lng]);else pin=L.marker([lat,lng]).addTo(map);map.setView([lat,lng],13);}void fillAreaFromCoords(Number($('latInput').value),Number($('lngInput').value));return true;}
function locate(forForm=false){if(!navigator.geolocation){toast('เบราว์เซอร์ไม่รองรับการหาตำแหน่ง');return;}toast('กำลังหาตำแหน่ง…');navigator.geolocation.getCurrentPosition(p=>{if(forForm)setCoords(p.coords.latitude,p.coords.longitude);else if(map)map.setView([p.coords.latitude,p.coords.longitude],13);},()=>toast('หาตำแหน่งไม่ได้ กรุณาอนุญาต GPS หรือเลือกบนแผนที่'),{timeout:12000,enableHighAccuracy:true});}
async function compressImage(file){if(!file)return '';if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('เลือกรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 8 MB');const bitmap=await createImageBitmap(file);const scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const result=canvas.toDataURL('image/jpeg',.78);if(result.length>1900000)throw Error('รูปยังใหญ่เกินไป กรุณาเลือกรูปขนาดเล็กลง');return result;}
async function submit(event){event.preventDefault();if(busy)return;const form=$('reportForm');if(!form.reportValidity())return;const fields=Object.fromEntries(new FormData(form));const lat=Number(fields.lat),lng=Number(fields.lng);if(!Number.isFinite(lat)||!Number.isFinite(lng)){toast('กรุณาระบุพิกัด');return;}busy=true;$('submitBtn').disabled=true;$('formError').textContent='';requestId=requestId||crypto.randomUUID();const payload={...fields,lat,lng,waterCm:fields.type==='flood'&&fields.waterCm!==''?Number(fields.waterCm):null,image:photo,requestId};
 try{let result;if(demo){result={id:'DEMO-'+requestId.slice(0,8)};}else{const response=await fetch(config.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});if(!response.ok)throw Error('ส่งข้อมูลไม่ได้ กรุณาลองใหม่');result=await response.json();if(result.status!=='ok')throw Error(result.message||'บันทึกไม่สำเร็จ');}
 $('reportDialog').close();$('successTitle').textContent=demo?'ทดลองส่งรายงานแล้ว':'บันทึกรายงานแล้ว';$('successMessage').textContent=demo?'นี่คือการทดลองแบบฟอร์ม ยังไม่ได้บันทึกลง Google Sheets หรือส่งให้หน่วยงานใด':'รายงานรอตรวจสอบก่อนแสดงบนแผนที่ กรุณาเก็บเลขรายงานนี้ไว้';$('trackingId').textContent=result.id;$('successDialog').showModal();form.reset();fillDistricts();photo='';requestId='';$('imagePreview').hidden=true;$('waterField').hidden=false;if(pin){map.removeLayer(pin);pin=null;}
 }catch(error){$('formError').textContent=error.message+' — ข้อมูลในแบบฟอร์มยังอยู่';}finally{busy=false;$('submitBtn').disabled=false;}}

function installProvinceSearch(){
 const select=$('provinceFilter');if($('provinceSearch'))return;
 const style=el('style');style.textContent='.province-picker{position:relative;margin-bottom:12px}.province-picker input{width:100%;box-sizing:border-box;padding:13px 38px 13px 14px;border:1px solid #dce3e8;border-radius:12px;background:#f7f9fa;font:inherit;color:#263942}.province-picker input:focus{outline:2px solid #3899d9;outline-offset:1px}.province-picker .province-clear{position:absolute;right:7px;top:7px;border:0;background:transparent;padding:5px 9px;font-size:20px;cursor:pointer;color:#64748b}.province-results{position:absolute;top:100%;left:0;right:0;z-index:850;background:white;border:1px solid #dce3e8;border-radius:12px;box-shadow:0 8px 24px #0002;max-height:260px;overflow-y:auto;margin-top:5px}.province-results[hidden]{display:none}.province-option{padding:10px 14px;cursor:pointer;color:#263942;font-size:14px}.province-option:hover,.province-option.highlight{background:#eaf3ff;color:#155db0}.province-empty{padding:12px;color:#64748b;font-size:13px}';document.head.append(style);
 const box=el('div','province-picker'),input=el('input'),clear=el('button','province-clear','×'),list=el('div','province-results');
 input.id='provinceSearch';input.type='text';input.placeholder='พิมพ์ค้นหาจังหวัด';input.autocomplete='off';input.setAttribute('aria-label','ค้นหาและเลือกจังหวัด');input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');input.setAttribute('aria-controls','provinceResults');list.id='provinceResults';list.setAttribute('role','listbox');list.setAttribute('aria-label','รายชื่อจังหวัด');list.hidden=true;clear.type='button';clear.setAttribute('aria-label','แสดงทั่วประเทศไทย');clear.title='แสดงทั่วประเทศไทย';box.append(input,clear,list);select.before(box);select.style.display='none';
 let choices=[],active=-1,last=select.value;
 function title(){return select.value||'ทั่วประเทศไทย · 77 จังหวัด';}
 function close(){list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');input.value=title();}
 function choose(value){select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));last=value;close();input.focus();close();}
 function highlight(){[...list.children].forEach((n,i)=>{n.classList.toggle('highlight',i===active);n.setAttribute('aria-selected',String(i===active));});if(active>=0){input.setAttribute('aria-activedescendant','provinceChoice'+active);list.children[active]?.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');}
 function show(){const q=input.value.trim().toLowerCase();choices=[...select.options].filter(o=>!q||o.text.toLowerCase().includes(q)||(o.value&&regions.find(p=>p.name===o.value)?.en.toLowerCase().includes(q)));list.replaceChildren();active=-1;
 if(!choices.length)list.append(el('div','province-empty','ไม่พบจังหวัด ลองพิมพ์ชื่อใหม่'));
 choices.forEach((o,i)=>{const n=el('div','province-option',o.text);n.id='provinceChoice'+i;n.setAttribute('role','option');n.setAttribute('aria-selected','false');n.addEventListener('mousedown',e=>e.preventDefault());n.onclick=()=>choose(o.value);list.append(n);});list.hidden=false;input.setAttribute('aria-expanded','true');input.removeAttribute('aria-activedescendant');}
 input.value=title();input.onfocus=()=>{input.value='';show();};input.onclick=()=>{if(list.hidden){input.value='';show();}};input.oninput=show;
 input.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close();return;}if(e.key==='Tab'){close();return;}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();if(list.hidden){input.value='';show();}if(choices.length){active=(active+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length;highlight();}}if(e.key==='Enter'&&!list.hidden){e.preventDefault();const exact=choices.find(o=>o.value===input.value.trim());if(active>=0)choose(choices[active].value);else if(exact)choose(exact.value);else if(choices.length===1)choose(choices[0].value);}};
 box.addEventListener('focusout',e=>{if(!box.contains(e.relatedTarget))close();});document.addEventListener('pointerdown',e=>{if(!box.contains(e.target))close();});clear.onclick=()=>choose('');
 select.addEventListener('change',()=>{last=select.value;close();});select.syncProvinceSearch=()=>{if(last!==select.value){last=select.value;close();}};
}

async function init(){
 let mobileLayout=innerWidth<=680;window.addEventListener('resize',()=>{const now=innerWidth<=680;if(map&&now!==mobileLayout){mobileLayout=now;map.invalidateSize();void showProvinceBoundary(true);}});
 $('modeLabel').textContent=demo?'ตัวอย่าง':'รายงานชุมชน';$('demoNote').hidden=!demo;$('sourceNote').textContent=demo?'ข้อมูลตัวอย่าง ไม่ใช่เหตุการณ์จริง':'แสดงเฉพาะรายงานที่ผ่านการตรวจสอบ';
 if(window.L){map=L.map('map',{zoomControl:false,preferCanvas:true});layer=L.layerGroup().addTo(map);const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,referrerPolicy:'strict-origin-when-cross-origin',attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(map);let warned=false;tiles.on('tileerror',()=>{if(!warned){warned=true;toast('พื้นแผนที่โหลดไม่ได้ ยังดูรายการและกรอกพิกัดได้');}});countryView();map.on('click',e=>{if(picking&&setCoords(e.latlng.lat,e.latlng.lng)){picking=false;$('mapNotice').hidden=true;$('reportDialog').showModal();}});}else{$('mapNotice').hidden=false;$('mapNotice').textContent='โหลดแผนที่ไม่ได้ โปรดตรวจสอบอินเทอร์เน็ต ยังใช้แบบฟอร์มและรายการได้';}
 try{const response=await fetch('thailand-data.json');if(!response.ok)throw Error();regions=await response.json();if(regions.length!==77)throw Error();regions.sort((a,b)=>a.name.localeCompare(b.name,'th'));for(const p of regions){$('provinceFilter').add(new Option(p.name,p.name));$('reportProvince').add(new Option(p.name,p.name));}}catch{regions=[];toast('โหลดรายชื่อจังหวัดไม่สำเร็จ กรุณาเปิดผ่านตัวเปิดเว็บไซต์');}
 installProvinceSearch();
 $('provinceFilter').onchange=()=>{closeDetail();void showProvinceBoundary(true);};$('searchInput').oninput=()=>render();$('reportProvince').onchange=fillDistricts;$('reportType').onchange=()=>{$('waterField').hidden=$('reportType').value!=='flood';};
 document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{type=b.dataset.type;document.querySelectorAll('[data-type]').forEach(x=>x.classList.toggle('active',x===b));closeDetail();render(true);});document.querySelectorAll('[data-severity]').forEach(b=>b.onclick=()=>{severity=b.dataset.severity;document.querySelectorAll('[data-severity]').forEach(x=>x.classList.toggle('active',x===b));closeDetail();render();});
 document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());$('newReportBtn').onclick=openReport;$('helpBtn').onclick=()=>$('helpDialog').showModal();$('refreshBtn').onclick=load;$('countryBtn').onclick=countryView;$('locateBtn').onclick=()=>locate();$('formGpsBtn').onclick=()=>locate(true);$('zoomIn').onclick=()=>map?.zoomIn();$('zoomOut').onclick=()=>map?.zoomOut();$('mobileListBtn').onclick=()=>{closeDetail();$('sidebar').classList.toggle('mobile-open');};$('pickMapBtn').onclick=()=>{if(!map){toast('แผนที่ยังไม่พร้อม สามารถกรอกพิกัดหรือใช้ GPS ได้');return;}picking=true;$('reportDialog').close();$('mapNotice').hidden=false;$('mapNotice').replaceChildren(el('span','','แตะตำแหน่งที่ต้องการบนแผนที่ '));const cancel=el('button','secondary','ยกเลิก');cancel.onclick=()=>{picking=false;$('mapNotice').hidden=true;$('reportDialog').showModal();};$('mapNotice').append(cancel);};
 let imageVersion=0;$('imageInput').onchange=async()=>{const version=++imageVersion;$('submitBtn').disabled=true;photo='';$('imagePreview').hidden=true;try{const result=await compressImage($('imageInput').files[0]);if(version!==imageVersion)return;photo=result;$('imagePreview').src=photo;$('imagePreview').hidden=!photo;}catch(error){toast(error.message);$('imageInput').value='';}finally{if(version===imageVersion)$('submitBtn').disabled=false;}};$('reportForm').onsubmit=submit;installAreaLookup();await load();
 if(document.modelContext?.registerTool){try{document.modelContext.registerTool({name:'filter_disaster_reports',description:'Filter the visible disaster map by province and hazard type. Does not submit reports.',inputSchema:{type:'object',properties:{province:{type:'string'},type:{type:'string',enum:['all','flood','quake']}},additionalProperties:false},execute(input){if(input.province&&!regions.some(p=>p.name===input.province))throw Error('Unknown province');if(input.type&&!['all','flood','quake'].includes(input.type))throw Error('Unknown type');$('provinceFilter').value=input.province||'';type=input.type||'all';document.querySelectorAll('[data-type]').forEach(b=>b.classList.toggle('active',b.dataset.type===type));closeDetail();render(true);return {visibleReports:filtered().length};}});}catch{}}
}
init().then(()=>window.dispatchEvent(new Event('disaster-ready')));
