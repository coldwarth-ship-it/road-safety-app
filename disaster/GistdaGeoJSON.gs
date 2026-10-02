/** Replace ofFlood_ in OfficialData.gs with this implementation. Key stays in Script Properties. */
function ofFlood_(query) {
 const key=PropertiesService.getScriptProperties().getProperty('GISTDA_API_KEY');
 if(!key)return {status:'needs_configuration',message:'รอ API key ของ GISTDA'};
 const raw=String(query.bbox||'').split(','),b=raw.map(Number),offset=Number(query.offset||0),limit=500;
 if(raw.length!==4||raw.some(x=>!x.trim())||b.some(x=>!Number.isFinite(x))||b[0]<97||b[1]<5||b[2]>106||b[3]>21||b[0]>=b[2]||b[1]>=b[3])return {status:'error',message:'ขอบเขตแผนที่ไม่ถูกต้อง'};
 if(b[2]-b[0]>3||b[3]-b[1]>3)return {status:'zoom_required',message:'ซูมเข้าเพื่อดูพื้นที่น้ำท่วมย้อนหลัง 3 วัน'};
 if(!Number.isInteger(offset)||offset<0||offset>10000||offset%limit!==0)return {status:'error',message:'ลำดับข้อมูลไม่ถูกต้อง'};
 const cache=CacheService.getScriptCache(),cacheKey='flood-geo3-v1:'+b.join(',')+':'+offset;
 function readCache(){const n=Number(cache.get(cacheKey+':count'));if(!n||n>30)return null;const chunks=[];for(let i=0;i<n;i++){const c=cache.get(cacheKey+':'+i);if(c===null)return null;chunks.push(c);}try{return JSON.parse(chunks.join(''));}catch(e){return null;}}
 const cached=query.diagnostic==='1'?null:readCache();if(cached)return cached;
 const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return {status:'busy',message:'กำลังโหลดข้อมูล กรุณาลองใหม่'};
 try {
  const again=query.diagnostic==='1'?null:readCache();if(again)return again;
  const url='https://api-gateway.gistda.or.th/api/2.0/resources/features/flood/3days?bbox='+encodeURIComponent(b.join(','))+'&limit='+limit+'&offset='+offset;
  const r=UrlFetchApp.fetch(url,{headers:{'API-Key':key},muteHttpExceptions:true,followRedirects:false});
  if(r.getResponseCode()!==200)return {status:'error',message:'GISTDA GeoJSON ตอบ HTTP '+r.getResponseCode()+' กรุณาตรวจสิทธิ์ API'};
  const text=r.getContentText();if(text.length>4000000)throw Error('size');const body=JSON.parse(text);
  if(body.type!=='FeatureCollection'||!Array.isArray(body.features)||body.features.length>limit)throw Error('schema');
  const features=body.features.map(f=>{
   if(!f||f.type!=='Feature'||!f.geometry||!['Polygon','MultiPolygon'].includes(f.geometry.type)||!Array.isArray(f.geometry.coordinates))throw Error('geometry');
   const p=f.properties||{},properties={};for(const k of ['pv_tn','ap_tn','tb_tn','f_area','file_name','_createdAt','_updatedAt'])if(typeof p[k]==='string'||typeof p[k]==='number')properties[k]=typeof p[k]==='string'?p[k].slice(0,1000):p[k];
   return {type:'Feature',geometry:f.geometry,properties:properties};
  });
  const matched=Number.isInteger(body.numberMatched)&&body.numberMatched>=0?body.numberMatched:null;
  const more=features.length===limit&&(matched===null||offset+features.length<matched);
  const result={status:'ok',type:'FeatureCollection',features:features,bbox:b,offset:offset,nextOffset:more?offset+limit:null,numberMatched:matched,numberReturned:features.length,periodDays:3,fetchedAt:new Date().toISOString(),sourceUrl:'https://disaster.gistda.or.th/services/open-api'};
  const serialized=JSON.stringify(result),chunks=Math.ceil(serialized.length/20000);
  if(chunks<=30){for(let i=0;i<chunks;i++)cache.put(cacheKey+':'+i,serialized.slice(i*20000,(i+1)*20000),600);cache.put(cacheKey+':count',String(chunks),600);}
  return result;
 }catch(error){return {status:'error',message:'อ่าน GeoJSON จาก GISTDA ไม่สำเร็จ กรุณาลองใหม่หรือซูมเข้า'};}finally{lock.releaseLock();}
}
