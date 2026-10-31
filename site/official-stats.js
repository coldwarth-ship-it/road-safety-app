/* Shared official statistics for the home page and province view. */
(function(root){
'use strict';
const metrics=['records','deaths','seriousInjuries','injuries','motorcycleRecords'];
function validate(d){
 if(d?.schemaVersion!==2||d.agency!=='กรมทางหลวง'||!Array.isArray(d.provinces)||d.provinces.length!==77||new Set(d.provinces.map(r=>r.province)).size!==77||!d.unattributed)throw Error('รูปแบบข้อมูลทางการไม่ถูกต้อง');
 const rows=[...d.provinces,d.unattributed];
 for(const key of metrics){if(!Number.isSafeInteger(d.totals?.[key])||d.totals[key]<0||rows.some(r=>!Number.isSafeInteger(r[key])||r[key]<0)||rows.reduce((n,r)=>n+r[key],0)!==d.totals[key])throw Error('ยอดรวมไม่ตรงกับรายจังหวัด');}
 for(const r of rows){if(r.hasRecords!==(r.records>0)||r.motorcycleRecords>r.records||r.seriousInjuries>r.injuries)throw Error('รายละเอียดสถิติไม่สอดคล้องกัน');}
 for(const value of [d.sourceEventRange?.from,d.sourceEventRange?.to,d.selectedEventRange?.from,d.selectedEventRange?.to])if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value)))throw Error('ช่วงวันที่ไม่ถูกต้อง');
 if(!Number.isFinite(Date.parse(d.fetchedAt)))throw Error('เวลานำเข้าไม่ถูกต้อง');
 for(const row of [d,...rows]){if(!row.causes||Object.values(row.causes).some(n=>!Number.isSafeInteger(n)||n<0)||Object.values(row.causes).reduce((a,b)=>a+b,0)!==(row===d?d.totals.records:row.records))throw Error('ยอดสาเหตุไม่ตรงกับระเบียนเหตุ');}
 return d;
}
function ratio(row){return row.records?row.motorcycleRecords/row.records*100:null;}
if(typeof module!=='undefined'&&module.exports){module.exports={validate,ratio};return;}
const $=id=>document.getElementById(id),put=(id,text)=>{if($(id))$(id).textContent=text;};
const fmt=n=>n.toLocaleString('th-TH');
function date(v,time=false){return new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',...(time?{timeStyle:'short'}:{}),timeZone:'Asia/Bangkok'}).format(new Date(time?v:v+'T00:00:00+07:00'));}
let snapshot=null,inflight=null;
function causes(row){
 const host=$('statsCauses');if(!host)return;host.replaceChildren();
 Object.entries(row.causes).sort((a,b)=>b[1]-a[1]).slice(0,6).forEach(([name,count])=>{
  const box=document.createElement('div');box.style.marginBottom='12px';
  const label=document.createElement('div');label.style.cssText='display:flex;justify-content:space-between;gap:12px;font-size:12px';
  const text=document.createElement('span');text.textContent=name;
  const value=document.createElement('span');value.textContent=fmt(count)+' ระเบียน • '+(count/row.records*100).toFixed(1)+'%';label.append(text,value);
  const track=document.createElement('div');track.className='risk-bar-track';const fill=document.createElement('div');fill.className='risk-bar-fill';fill.style.background='var(--primary)';fill.style.width=(count/row.records*100)+'%';track.append(fill);box.append(label,track);host.append(box);
 });
 if(!row.records)host.textContent='ไม่พบระเบียนในไฟล์สำหรับจังหวัดนี้';
}
function render(){
 const d=snapshot;if(!d)return;const selected=$('officialProvince')?.value||'';
 const all=[...d.provinces,...(d.unattributed.records?[d.unattributed]:[])];
 const rows=selected?all.filter(r=>r.province===selected):all.slice();rows.sort((a,b)=>b.records-a.records||a.province.localeCompare(b.province,'th'));
 const row=selected?rows[0]:{...d.totals,causes:d.causes,hasRecords:true};if(!row)return;
 // The home card always uses the nationwide total, independently of the province filter.
 put('totalAccidents',fmt(d.totals.records));
 put('dashboardAccidentSource','กรมทางหลวง • ปี '+(d.year+543)+' • เหตุถึง '+date(d.selectedEventRange.to));
 put('officialHomeStatus','ข้อมูลทางการ TRAMS • 77 จังหวัด • ตรวจต้นทางล่าสุด '+date(d.fetchedAt,true));
 for(const [id,key] of [['statTotalAccidents','records'],['statTotalDeaths','deaths'],['statTotalInjured','seriousInjuries']])put(id,row.hasRecords?fmt(row[key]):'—');
 const percentage=ratio(row);put('statAvgRatio',percentage===null?'—':percentage.toFixed(2)+'%');
 put('statAccidentsChange',selected||'รวมประเทศ • 77 จังหวัด');put('statDeathsChange','คน ตามระเบียนต้นทาง');put('statInjuredChange','บาดเจ็บรวม '+fmt(row.injuries)+' คน (รวมสาหัสแล้ว)');put('statRatioChange','ระเบียนที่มี จยย. '+fmt(row.motorcycleRecords)+' / '+fmt(row.records)+' ระเบียน');
 put('statsYearLabel','ปี '+(d.year+543)+' • '+(selected||'ครบ 77 จังหวัด')+' • เฉพาะโครงข่ายกรมทางหลวง');
 put('officialMetadata','วันที่เกิดเหตุ '+date(d.selectedEventRange.from)+' – '+date(d.selectedEventRange.to)+' | ไฟล์ต้นทางปรับปรุง '+(d.resourceModifiedAt?date(d.resourceModifiedAt.slice(0,10)):'ไม่ระบุ')+' | ตรวจและนำเข้าสำเร็จ '+date(d.fetchedAt,true));
 const age=Math.max(0,Math.floor((Date.now()-Date.parse(d.selectedEventRange.to+'T23:59:59+07:00'))/86400000));
 put('officialFreshness','เหตุล่าสุดในไฟล์ผ่านมา '+age+' วัน • ตรวจต้นทางทุกวัน แต่ยอดเปลี่ยนเมื่อหน่วยงานเผยแพร่ข้อมูลใหม่ • ไม่ใช่รายงานสด');
 const body=$('statsTableBody');if(body){body.replaceChildren();rows.forEach(r=>{
  const tr=document.createElement('tr'),pct=ratio(r);
  for(const text of [r.province,r.hasRecords?fmt(r.records):'—',r.hasRecords?fmt(r.deaths):'—',r.hasRecords?fmt(r.seriousInjuries):'—',pct===null?'—':pct.toFixed(2)+'%',r.hasRecords?(r.latestEventDate?date(r.latestEventDate):'ไม่ระบุ'):'ไม่พบระเบียนในไฟล์']){const td=document.createElement('td');td.textContent=text;tr.append(td);}body.append(tr);
 });}
 causes(row);put('statsCauseSource','มูลเหตุสันนิษฐานตามระเบียน TRAMS • '+(selected||'กรมทางหลวงทั้งประเทศ')+' • ร้อยละต่อระเบียนเหตุในชุดที่เลือก');
}
async function performLoad(){
 put('officialLoadStatus',snapshot?'กำลังตรวจผลนำเข้าล่าสุด…':'กำลังโหลดสถิติทางการ…');
 try{
  const response=await fetch('data/trams-doh.json',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('HTTP '+response.status);
  const data=validate(await response.json());
  const select=$('officialProvince');if(select){const chosen=select.value;select.replaceChildren(new Option('ทุกจังหวัด',''));data.provinces.slice().sort((a,b)=>a.province.localeCompare(b.province,'th')).forEach(r=>select.add(new Option(r.province,r.province)));if(data.unattributed.records)select.add(new Option(data.unattributed.province,data.unattributed.province));if([...select.options].some(o=>o.value===chosen))select.value=chosen;}
  snapshot=data;render();put('officialLoadStatus','แสดงผลนำเข้าล่าสุดแล้ว • ปุ่มนี้โหลดข้อมูลที่ระบบนำเข้าให้อัตโนมัติ');
 }catch(error){
  put('officialLoadStatus',(snapshot?'โหลดใหม่ไม่สำเร็จ กำลังแสดงผลครั้งก่อน: ':'ยังโหลดสถิติทางการไม่ได้: ')+error.message);
  if(!snapshot){put('totalAccidents','—');put('dashboardAccidentSource','โหลดข้อมูลทางการไม่สำเร็จ');put('officialHomeStatus','ยังโหลดสถิติไม่ได้ กรุณาลองใหม่');}
 }
}
root.RoadOfficialStats={load(){if(!inflight)inflight=performLoad().finally(()=>{inflight=null;});return inflight;},render,validate};
document.addEventListener('DOMContentLoaded',()=>{
 $('officialProvince')?.addEventListener('change',render);
 setInterval(()=>{if(!document.hidden)root.RoadOfficialStats.load();},15*60*1000);
});
})(typeof window!=='undefined'?window:globalThis);
