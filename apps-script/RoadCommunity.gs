/** Integration: at the start of doGet, handle sheet=road_chat with
 * return roadCommunityJson_(readRoadChat_(e.parameter.room));
 * After parsing doPost payload p, before existing action routes:
 * var community = handleRoadCommunity_(p);
 * if (community !== null) return roadCommunityJson_(community);
 * apiPostReport must delegate to the same route. Never replace existing routes.
 */
function roadCommunityJson_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
function roadCommunityDb_(){return SpreadsheetApp.openById('1Nr0g-rwG3sg-qhrHBeq26fBKNdbUES0MiPbnpQgchgs');}
function roadCommunityBadWords_(value){var clean=String(value).normalize('NFKC').toLowerCase().replace(/[\s\u200B-\u200D\uFEFF._*\-]+/g,'');return /ควย|เย็ด|เหี้ย|สัส|ไอ้สัตว์|fuck|shit|bitch/.test(clean);}
function roadCommunityText_(value,max,required){var text=String(value==null?'':value).trim();if(text.length>max||(required&&!text))throw Error('กรอกข้อมูลไม่ครบหรือข้อความยาวเกินกำหนด');return text;}
function roadCommunityCell_(value){var text=String(value);return /^[=+@\-]/.test(text)?"'"+text:text;}
function roadCommunityRequest_(value){var id=String(value||'');if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('รหัสคำขอไม่ถูกต้อง');return id;}
function roadCommunityRoom_(value){var room=roadCommunityText_(value,160,true);if(room!=='general'&&!/^point:.+|^coord:-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(room))throw Error('ห้องแชทไม่ถูกต้อง');return room;}
function handleRoadCommunity_(p){if(!p||['submit_rider_incident','send_road_chat'].indexOf(p.action)<0)return null;var lock=LockService.getScriptLock();if(!lock.tryLock(10000))return {status:'error',message:'มีผู้ใช้งานพร้อมกัน กรุณาลองอีกครั้ง'};try{return p.action==='submit_rider_incident'?submitRiderIncident_(p):sendRoadChat_(p);}catch(e){return {status:'error',message:e.message};}finally{lock.releaseLock();}}
function submitRiderIncident_(p){
 var requestId=roadCommunityRequest_(p.requestId);if(p.website)throw Error('ไม่สามารถรับคำขอนี้');
 var name=roadCommunityText_(p.name,120,true),province=roadCommunityText_(p.province,60,true),district=roadCommunityText_(p.district,60,false),pointId=roadCommunityText_(p.pointId,80,false);
 var detail=roadCommunityText_(p.detail,1000,true),cause=roadCommunityText_(p.cause,600,true),prevention=roadCommunityText_(p.prevention,600,true);
 if(roadCommunityBadWords_([name,province,district,pointId,detail,cause,prevention].join(' ')))throw Error('พบคำไม่สุภาพ กรุณาแก้ไขก่อนส่ง');
 if(p.lat==null||p.lng==null||String(p.lat).trim()===''||String(p.lng).trim()==='')throw Error('กรุณาระบุพิกัด');
 var lat=Number(p.lat),lng=Number(p.lng);if(!isFinite(lat)||!isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)throw Error('พิกัดไม่ถูกต้อง');
 var level=String(p.level||'');if(['Lessthan','Level 1','Level 2','Level 3','Serious case','Fatalities'].indexOf(level)<0)throw Error('ระดับการบาดเจ็บไม่ถูกต้อง');
 var sheet=roadCommunityDb_().getSheetByName('อุบัติเหตุจริง');if(!sheet)throw Error('ไม่พบแท็บอุบัติเหตุจริง');
 var headers=['รหัสเหตุ','รหัสจุด','ชื่อจุด','จังหวัด','อำเภอ','ละติจูด','ลองจิจูด','Level','รายละเอียดโดยประมาณ','สาเหตุ','การป้องกัน','สถานะ'];
 var actual=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];var indexes=headers.map(function(h){return actual.indexOf(h);});if(indexes.some(function(i){return i<0;}))throw Error('หัวคอลัมน์อุบัติเหตุจริงไม่ครบ');
 var id='INC-'+requestId;if(sheet.getLastRow()>1){var ids=sheet.getRange(2,indexes[0]+1,sheet.getLastRow()-1,1).getDisplayValues();if(ids.some(function(row){return row[0]===id;}))return {status:'ok',dataset:'rider_incident_submission',id:id};}
 var row=new Array(actual.length).fill('');var values=[id,pointId,name,province,district,lat,lng,level,detail,cause,prevention,'รอตรวจสอบ'];values.forEach(function(v,i){row[indexes[i]]=typeof v==='number'?v:roadCommunityCell_(v);});sheet.getRange(sheet.getLastRow()+1,1,1,row.length).setValues([row]);return {status:'ok',dataset:'rider_incident_submission',id:id};
}
function roadChatSheet_(){var db=roadCommunityDb_(),sheet=db.getSheetByName('แชทจุดเสี่ยง');if(!sheet){sheet=db.insertSheet('แชทจุดเสี่ยง');sheet.appendRow(['รหัสข้อความ','เวลา','ห้อง','ชื่อเล่น','ข้อความ','สถานะ']);sheet.setFrozenRows(1);}return sheet;}
function sendRoadChat_(p){var id='CHAT-'+roadCommunityRequest_(p.requestId),room=roadCommunityRoom_(p.room),nickname=roadCommunityText_(p.nickname,30,true),message=roadCommunityText_(p.message,500,true);if(roadCommunityBadWords_(nickname+' '+message))throw Error('พบคำไม่สุภาพ กรุณาแก้ไขก่อนส่ง');var sheet=roadChatSheet_(),rows=sheet.getDataRange().getValues();if(rows.some(function(r){return r[0]===id;}))return {status:'ok',dataset:'road_chat_submission',id:id};var now=Date.now();if(rows.slice(1).some(function(r){return r[2]===room&&r[3]===nickname&&now-new Date(r[1]).getTime()<5000;}))throw Error('กรุณาเว้นระยะอย่างน้อย 5 วินาทีระหว่างข้อความ');sheet.appendRow([id,new Date(),roadCommunityCell_(room),roadCommunityCell_(nickname),roadCommunityCell_(message),'แสดง']);return {status:'ok',dataset:'road_chat_submission',id:id};}
function readRoadChat_(value){try{var room=roadCommunityRoom_(value||'general'),sheet=roadCommunityDb_().getSheetByName('แชทจุดเสี่ยง');if(!sheet)return {status:'ok',dataset:'road_chat',data:[]};var cutoff=Date.now()-30*86400000;var data=sheet.getDataRange().getValues().slice(1).filter(function(r){return r[2]===room&&r[5]==='แสดง'&&new Date(r[1]).getTime()>=cutoff;}).slice(-100).map(function(r){return {id:String(r[0]),time:new Date(r[1]).toISOString(),nickname:String(r[3]),message:String(r[4])};});return {status:'ok',dataset:'road_chat',data:data};}catch(e){return {status:'error',message:e.message};}}
