const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../site/media-core.js');
test('media validation rejects unsupported files, oversized files and empty uploads',()=>{
  assert.throws(()=>core.validateFiles([]));
  assert.throws(()=>core.validateFiles([{type:'image/svg+xml',size:20}]));
  assert.throws(()=>core.validateFiles([{type:'image/png',size:11*1024*1024}]));
  assert.doesNotThrow(()=>core.validateFiles([{type:'image/png',size:1024}]));
  assert.throws(()=>core.title(' '));assert.throws(()=>core.category('script'));
});
test('order moves preserve each item; trash stays out of public data',()=>{
  const original=[{id:'a',sort_order:2},{id:'b',sort_order:1},{id:'c',sort_order:0,deleted_at:'today'}];
  assert.deepEqual(core.move(original,0,2).map(i=>i.id),['b','c','a']);
  assert.deepEqual(original.map(i=>i.id),['a','b','c']);
  assert.deepEqual(core.publicItems(original).map(i=>i.id),['b','a']);
  assert.equal(core.imagePath('https://attacker.invalid/a.png'),false);
  assert.equal(core.imagePath('../../anything.png'),false);
});
test('existing comic and storage URLs work while external or credential-bearing URLs are rejected',()=>{
  const project='https://selohymkkwvldhtohtbm.supabase.co',bucket='sharky-media';
  assert(core.trustedImageUrl('https://coldwarth-ship-it.github.io/road-safety-app/game/assets/story-01.webp',project,bucket));
  assert(core.trustedImageUrl(project+'/storage/v1/object/public/'+bucket+'/image.webp',project,bucket));
  for(const url of ['javascript:alert(1)','https://attacker.invalid/image.png','https://coldwarth-ship-it.github.io/other/image.png','https://u:p@coldwarth-ship-it.github.io/road-safety-app/a.png',project+'/storage/v1/object/public/chat-images/private.png']){
    assert.equal(core.trustedImageUrl(url,project,bucket),false);
  }
});
function authHarness({identity=200,anonymous=false,permission='true',permissionStatus=200,configured=true}={}){
  const calls=[];
  const context={PropertiesService:{getScriptProperties:()=>({getProperty:n=>configured?(n==='ROAD_SUPABASE_URL'?'https://selohymkkwvldhtohtbm.supabase.co':'public-key'):null})},
    UrlFetchApp:{fetch:(url,options)=>{calls.push({url,options});const isUser=url.endsWith('/user');return {getResponseCode:()=>isUser?identity:permissionStatus,getContentText:()=>isUser?JSON.stringify({id:'owner-user',is_anonymous:anonymous}):permission};}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('apps-script/RoadOwnerAuth.gs','utf8'),context);
  return {context,calls};
}
test('missing, forged, anonymous, expired and non-owner sessions cannot pass the server gate',()=>{
  for(const token of ['',null,'bad token\n']){const h=authHarness();assert.throws(()=>h.context.roadRequireOwner_(token));assert.equal(h.calls.length,0);}
  for(const options of [{identity:401},{anonymous:true},{permission:'false'},{permission:'{"owner":true}'},{permissionStatus:500},{configured:false}]){
    const h=authHarness(options);assert.throws(()=>h.context.roadRequireOwner_('signed.jwt.token'));
  }
  const h=authHarness();assert.equal(h.context.roadRequireOwner_('signed.jwt.token'),'owner-user');assert.equal(h.calls.length,2);
  assert(h.calls.every(c=>c.options.followRedirects===false));assert(h.calls.every(c=>!c.url.includes('signed.jwt.token')));
});
test('incident route rejects unauthorized request before touching the spreadsheet',()=>{
  let writes=0;
  const context={roadRequireOwner_:()=>{throw Error('Owner required');},SpreadsheetApp:{openById:()=>{writes++;throw Error('Unexpected sheet access');}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('apps-script/RoadCommunity.gs','utf8'),context);
  assert.throws(()=>context.submitRiderIncident_({}),/Owner required/);assert.equal(writes,0);
});
test('authorized incident submission is pending, escapes spreadsheet formulas and deduplicates retries',()=>{
  const headers=['รหัสเหตุ','รหัสจุด','ชื่อจุด','จังหวัด','อำเภอ','ละติจูด','ลองจิจูด','Level','รายละเอียดโดยประมาณ','สาเหตุ','การป้องกัน','สถานะ'];
  const rows=[headers];let authChecks=0;
  const sheet={getLastColumn:()=>headers.length,getLastRow:()=>rows.length,getRange:(r,c,n=1,w=1)=>({
    getDisplayValues:()=>rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w)),
    setValues:values=>values.forEach((row,i)=>{rows[r-1+i]=row;})
  })};
  const context={SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet})},roadRequireOwner_:()=>{authChecks++;return 'owner';}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('apps-script/RoadCommunity.gs','utf8'),context);
  const request={ownerToken:'signed.jwt.token',requestId:'12345678-1234-1234-1234-123456789abc',name:'=IMPORTXML("example")',province:'ชลบุรี',district:'เมือง',lat:13,lng:101,level:'Level 2',detail:'ลื่นเสียหลัก',cause:'ถนนลื่น',prevention:'ลดความเร็ว'};
  const first=context.submitRiderIncident_(request),retry=context.submitRiderIncident_(request);
  assert.equal(first.id,retry.id);assert.equal(rows.length,2);assert.equal(authChecks,2);
  assert.equal(rows[1][11],'รอตรวจสอบ');assert.equal(rows[1][2][0],"'");
  assert.equal(headers.length,12);assert(!rows[1].includes('signed.jwt.token'));
});
test('release preserves the report POST transport while local preview rejects writes',async()=>{
  const html=fs.readFileSync('index.html','utf8');
  const api=html.match(/function apiPost\(payload\) \{[\s\S]*?\n\}/)[0];
  assert(!html.includes('apiPost=()=>Promise.reject'));
  let posts=0;
  const context={window:{IS_GAS:false},location:{hostname:'coldwarth-ship-it.github.io',protocol:'https:'},localStorage:{getItem:()=>null},DEFAULT_GS_URL:'https://script.google.com/macros/s/test/exec',fetch:async(url,opts)=>{assert.equal(opts.method,'POST');posts++;return {json:async()=>({status:'ok'})};}};
  vm.createContext(context);vm.runInContext(api,context);
  assert.equal((await context.apiPost({action:'report'})).status,'ok');assert.equal(posts,1);
  context.location.hostname='terminal.local';await assert.rejects(context.apiPost({action:'report'}));assert.equal(posts,1);
});
