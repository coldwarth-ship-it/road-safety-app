(function() {
  'use strict';
  const cfg=window.ROAD_OWNER_CONFIG,core=window.RoadMediaCore;
  let client,owner=false,session=null,items=[],files=[],category='media',busy=false;
  let currentMedia=[],readerItem=0,readerPage=0,loadGeneration=0,ownerGeneration=0;
  const signed=new Map(),$=id=>document.getElementById(id);
  function node(tag,text,cls) {const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
  function cloud() {
    if(!client){
      if(!window.supabase?.createClient)throw Error('โหลดระบบสื่อไม่สำเร็จ กรุณารีเฟรช');
      client=window.supabase.createClient(cfg.url,cfg.key,{auth:{storageKey:'road-safety-owner-v1',persistSession:false,detectSessionInUrl:false,autoRefreshToken:true}});
      client.auth.onAuthStateChange((event,s)=>{
        session=s;
        if(event==='SIGNED_OUT'||!s){owner=false;ownerGeneration++;updateOwnerUi();}
      });
    }
    return client;
  }
  function status(message,error=false){$('ownerStatus').textContent=message;$('ownerStatus').dataset.error=String(error);}
  function lock(value){busy=value;$('ownerWorkspace').classList.toggle('owner-busy',value);$('ownerLogout').disabled=value;}
  async function checkOwner() {
    const generation=++ownerGeneration;
    owner=false;
    const c=cloud(),{data,error}=await c.auth.getSession();if(error)throw error;
    session=data.session;
    if(!session){updateOwnerUi();return false;}
    const verified=await c.auth.getUser();if(verified.error){updateOwnerUi();throw verified.error;}
    const permission=await c.rpc(cfg.ownerRpc);if(permission.error){updateOwnerUi();throw Error('ยังตรวจสิทธิ์เจ้าของไม่ได้ กรุณาตรวจการตั้งค่าหลังบ้าน');}
    if(generation!==ownerGeneration)return false;
    owner=permission.data===true;updateOwnerUi();return owner;
  }
  function updateOwnerUi(){
    if(!$('ownerLogin'))return;
    $('ownerLogin').hidden=owner;$('ownerWorkspace').hidden=!owner;$('ownerLogout').hidden=!session;
    $('ownerEmailLabel').textContent=owner?(session?.user?.email||'เจ้าของระบบ'):'';
  }
  async function requireOwner(){
    if(cfg.readOnly)throw Error('ตัวอย่างในเครื่องปิดการบันทึกข้อมูลจริง');
    if(!await checkOwner())throw Error('กรุณาเข้าสู่ระบบด้วยบัญชีเจ้าของ');
  }
  async function signedUrl(image){
    const value=typeof image==='string'?image:image?.path;
    if(core.trustedImageUrl(value,cfg.url,cfg.bucket))return value;
    if(!core.imagePath(value))throw Error('ตำแหน่งภาพไม่ถูกต้อง');
    return cloud().storage.from(cfg.bucket).getPublicUrl(value).data.publicUrl;
  }
  async function loadPublic(requestedCategory=category){
    category=core.category(requestedCategory);const generation=++loadGeneration;
    document.querySelectorAll('.media-tab').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.category===category)));
    const host=$('sharkyMediaGrid');if(!host)return;host.replaceChildren(node('p','กำลังโหลดสื่อ…','media-empty'));
    $('mediaCount').textContent='กำลังโหลด';
    try{
      const {data,error}=await cloud().from(cfg.table).select('id,title,category,images,sort_order,updated_at').eq('category',category).eq('published',true).is('deleted_at',null).order('sort_order').order('id').limit(1000);
      if(error)throw Error('ยังโหลดคลังสื่อไม่ได้ กรุณาลองใหม่ภายหลัง');
      if(generation!==loadGeneration)return;
      currentMedia=data||[];$('mediaCount').textContent=currentMedia.length+' รายการ';host.replaceChildren();
      if(!currentMedia.length){host.append(node('p','ยังไม่มีสื่อในหมวดนี้','media-empty'));return;}
      currentMedia.forEach((item,index)=>{
        const card=node('figure',undefined,'media-card'),button=node('button'),img=node('img'),caption=node('figcaption',item.title);
        button.type='button';button.setAttribute('aria-label','อ่าน '+item.title);button.onclick=()=>openReader(index,0);
        img.alt=item.title;img.loading='lazy';button.append(img);card.append(button,caption);host.append(card);
        signedUrl(item.images[0]).then(url=>{if(generation===loadGeneration)img.src=url;}).catch(()=>{caption.append(node('p','รูปยังโหลดไม่ได้ กดเปิดเพื่อลองใหม่'));});
      });
    }catch(e){
      if(generation!==loadGeneration)return;currentMedia=[];$('mediaCount').textContent='ยังโหลดข้อมูลไม่ได้';
      const retry=node('button','ลองโหลดสื่อใหม่','btn btn-secondary');retry.onclick=()=>loadPublic(category);host.replaceChildren(node('p',e.message,'media-empty'),retry);
    }
  }
  async function openReader(index,page=0){
    const item=currentMedia[index];if(!item?.images?.[page])return;
    readerItem=index;readerPage=page;
    const dialog=$('sharkyReader'),img=$('sharkyReaderImage');
    $('sharkyReaderTitle').textContent=item.title;img.removeAttribute('src');img.alt='กำลังโหลด '+item.title;
    $('sharkyReaderPage').textContent=(page+1)+' / '+item.images.length;
    $('sharkyPrevious').disabled=index===0&&page===0;
    $('sharkyNext').disabled=index===currentMedia.length-1&&page===item.images.length-1;
    if(!dialog.open)dialog.showModal();
    try{const url=await signedUrl(item.images[page]);if(readerItem===index&&readerPage===page){img.src=url;img.alt=item.title+' หน้า '+(page+1);}}
    catch(e){img.alt=e.message;}
  }
  function readerMove(delta){
    let index=readerItem,page=readerPage+delta;
    if(page<0){index--;if(index<0)return;page=currentMedia[index].images.length-1;}
    if(page>=currentMedia[index].images.length){index++;page=0;}
    if(index<currentMedia.length)openReader(index,page);
  }
  async function loadOwner(){
    if(!owner)return;
    const {data,error}=await cloud().from(cfg.table).select('*').order('sort_order').order('id').limit(1000);
    if(error)throw Error('โหลดรายการจัดการไม่ได้');items=data||[];renderOwner();
  }
  function renderOwner(){
    const host=$('ownerList'),trash=$('ownerTrash').checked,selected=$('ownerCategoryFilter').value;host.replaceChildren();
    const list=items.filter(m=>!!m.deleted_at===trash&&m.category===selected);
    if(!list.length){host.append(node('p',trash?'ไม่มีรายการในถังพัก':'ยังไม่มีสื่อในหมวดนี้','owner-empty'));return;}
    list.forEach((item,index)=>{
      const card=node('article',undefined,'owner-card'),body=node('div',undefined,'owner-card-content'),img=node('img');img.alt=item.title;
      signedUrl(item.images[0]).then(url=>img.src=url).catch(()=>{});
      body.append(node('h3',item.title),node('p',(item.category==='comic'?'การ์ตูน':'สื่อความปลอดภัย')+' • '+item.images.length+' ภาพ'));
      const actions=node('div',undefined,'owner-card-actions');
      if(!trash){
        for(const [label,delta] of [['↑ ขึ้น',-1],['↓ ลง',1]]){
          const b=node('button',label,'btn btn-secondary');b.type='button';b.disabled=(delta<0?index===0:index===list.length-1)||busy;b.onclick=()=>run(()=>reorder(list,index,index+delta));actions.append(b);
        }
        const rename=node('button','แก้ชื่อ','btn btn-secondary');rename.onclick=()=>{
          $('ownerRenameId').value=item.id;$('ownerRenameTitle').value=item.title;$('ownerRename').showModal();
        };actions.append(rename);
      }
      const remove=node('button',trash?'กู้คืน':'ย้ายไปถังพัก','btn btn-secondary');remove.disabled=busy;
      remove.onclick=()=>{
        if(trash)run(()=>update(item,{deleted_at:null}));
        else{$('ownerConfirmTitle').textContent='ย้าย “'+item.title+'” ไปถังพัก?';$('ownerConfirm').dataset.itemId=item.id;$('ownerConfirm').showModal();}
      };
      actions.append(remove);body.append(actions);card.append(img,body);host.append(card);
    });
  }
  async function update(item,patch){
    await requireOwner();
    const {data,error}=await cloud().from(cfg.table).update({...patch,updated_at:new Date().toISOString()}).eq('id',item.id).eq('updated_at',item.updated_at).select('id');
    if(error)throw error;if(!data?.length)throw Error('รายการถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดใหม่');
    signed.clear();status(patch.deleted_at?'ย้ายเข้าถังพักแล้ว':patch.deleted_at===null?'กู้คืนแล้ว':'บันทึกแล้ว');
  }
  async function reorder(list,from,to){
    await requireOwner();const order=core.move(list,from,to);
    const {error}=await cloud().rpc(cfg.reorderRpc,{p_category:list[from].category,p_ids:order.map(m=>m.id)});
    if(error)throw Error('บันทึกลำดับไม่ได้ รายการอาจเปลี่ยนไป กรุณาโหลดใหม่');status('บันทึกลำดับแล้ว');
  }
  async function run(action){
    if(busy)return;lock(true);
    try{await action();await loadOwner();loadPublic(category);}catch(e){status(e.message||'ทำรายการไม่สำเร็จ',true);}
    finally{lock(false);renderOwner();}
  }
  function renderFiles(){
    const host=$('ownerFiles');host.replaceChildren();
    files.forEach((file,i)=>{
      const row=node('li'),name=node('span',(i+1)+'. '+file.name);row.append(name);
      for(const [label,delta] of [['↑',-1],['↓',1]]){
        const b=node('button',label,'btn btn-secondary');b.type='button';b.disabled=delta<0?i===0:i===files.length-1;
        b.setAttribute('aria-label',label+' '+file.name);b.onclick=()=>{files=core.move(files,i,i+delta);renderFiles();};row.append(b);
      }host.append(row);
    });
  }
  async function upload(event){
    event.preventDefault();
    await run(async()=>{
      await requireOwner();core.validateFiles(files);const title=core.title($('ownerTitle').value),kind=core.category($('ownerType').value);
      const c=cloud(),id=crypto.randomUUID(),images=[];
      for(let i=0;i<files.length;i++){
        const file=files[i],bitmap=await createImageBitmap(file);bitmap.close();
        const path=session.user.id+'/'+id+'/'+String(i).padStart(2,'0')+'-'+crypto.randomUUID()+'.'+core.TYPES[file.type];
        status('กำลังอัปโหลดภาพ '+(i+1)+' / '+files.length);
        const {error}=await c.storage.from(cfg.bucket).upload(path,file,{contentType:file.type,upsert:false,cacheControl:'60'});
        if(error)throw Error('อัปโหลดไม่สำเร็จ ยังไม่เผยแพร่รายการนี้ กรุณาลองใหม่');
        images.push(c.storage.from(cfg.bucket).getPublicUrl(path).data.publicUrl);
      }
      const sort=items.filter(m=>m.category===kind).reduce((n,m)=>Math.max(n,m.sort_order+1),0);
      const {error}=await c.from(cfg.table).insert({id,title,category:kind,images,sort_order:sort,published:true});
      if(error)throw Error('ยังบันทึกรายการไม่ได้ ภาพที่อัปโหลดยังไม่เปิดให้สาธารณะอ่าน');
      $('ownerEditor').reset();files=[];renderFiles();status('เพิ่มรายการแล้ว ผู้ใช้ทั่วไปเปิดอ่านได้');
    });
  }
  async function login(event){
    event.preventDefault();const button=$('ownerSendCode');button.disabled=true;
    try{
      if(cfg.readOnly)throw Error('ตัวอย่างในเครื่องยังไม่ส่งรหัสเข้าระบบจริง');
      const email=$('ownerEmail').value.trim();
      const {error}=await cloud().auth.signInWithOtp({email,options:{shouldCreateUser:false}});
      if(error)throw Error('ส่งรหัสไม่ได้ กรุณาตรวจอีเมลหรือการตั้งค่าเข้าสู่ระบบ');
      $('ownerCodeForm').hidden=false;status('ตรวจอีเมลและกรอกรหัสยืนยัน หากบัญชีนี้ได้รับอนุญาต');
    }catch(e){status(e.message,true);}finally{button.disabled=false;}
  }
  async function verify(event){
    event.preventDefault();const button=$('ownerVerifyCode');button.disabled=true;
    try{
      if(cfg.readOnly)throw Error('ตัวอย่างในเครื่องยังไม่เข้าสู่ระบบจริง');
      const {error}=await cloud().auth.verifyOtp({email:$('ownerEmail').value.trim(),token:$('ownerCode').value.trim(),type:'email'});
      if(error)throw Error('รหัสไม่ถูกต้องหรือหมดอายุ กรุณาขอรหัสใหม่');
      $('ownerCode').value='';
      if(!await checkOwner()){await cloud().auth.signOut();throw Error('บัญชีนี้ยังไม่ได้รับสิทธิ์เจ้าของ');}
      status('เข้าสู่ระบบเจ้าของแล้ว');await loadOwner();
    }catch(e){status(e.message,true);}finally{button.disabled=false;}
  }
  async function openOwner(){
    $('ownerEntry').showModal();status('');
    try{if(await checkOwner())await loadOwner();}catch(e){status(e.message,true);}
  }
  async function ownerIncident(event){
    event.preventDefault();
    const button=$('entrySubmit'),message=$('entryStatus');if(button.disabled)return;button.disabled=true;
    try{
      await requireOwner();
      const form=event.target,data=Object.fromEntries(new FormData(form));
      if(window.communityBadWords?.([data.name,data.detail,data.cause,data.prevention].join(' ')))throw Error('กรุณาแก้ไขคำไม่สุภาพก่อนส่ง');
      message.textContent='กำลังบันทึก…';
      const {data:auth,error}=await cloud().auth.getSession();if(error||!auth.session)throw Error('กรุณาเข้าสู่ระบบใหม่');
      const result=await apiPost({action:'submit_rider_incident',requestId:entryRequestId,ownerToken:auth.session.access_token,...data});
      if(result.status!=='ok'||result.dataset!=='rider_incident_submission')throw Error(result.message||'ยังยืนยันการบันทึกไม่ได้');
      message.textContent='บันทึกแล้ว รหัส '+result.id+' • รอตรวจสอบก่อนเผยแพร่';
      form.reset();entryRequestId=crypto.randomUUID();
      if(entryPickMarker){entryPickMarker.remove();entryPickMarker=null;}
    }catch(e){message.textContent=e.message+' • หากลองซ้ำ ระบบจะใช้รหัสคำขอเดิมเพื่อป้องกันข้อมูลซ้ำ';}
    finally{button.disabled=false;}
  }
  function install(){
    const old=$('ownerEntry');if(old)old.remove();
    const dialog=node('dialog');dialog.id='ownerEntry';dialog.className='owner-dialog';
    dialog.innerHTML=`<header class="owner-header"><div><h2>จัดการเว็บของเรา</h2><small id="ownerEmailLabel"></small></div><button type="button" class="btn btn-secondary" id="ownerClose">ปิด</button></header>
      <p id="ownerStatus" class="owner-status" role="status" aria-live="polite"></p>
      <div id="ownerLogin" class="owner-login"><h3>เข้าสู่ระบบเจ้าของ</h3><p class="owner-note">ใช้บัญชีเจ้าของที่ได้รับอนุญาต รหัสยืนยันจะส่งทางอีเมล</p>
      <form id="ownerEmailForm"><label>อีเมล<input id="ownerEmail" type="email" autocomplete="email" required></label><button id="ownerSendCode" class="btn btn-primary">ขอรหัสยืนยัน</button></form>
      <form id="ownerCodeForm" hidden><label>รหัสจากอีเมล<input id="ownerCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" required></label><button id="ownerVerifyCode" class="btn btn-primary">ยืนยันเข้าสู่ระบบ</button></form></div>
      <div id="ownerWorkspace" hidden><div class="owner-toolbar"><button id="ownerAddIncident" class="btn btn-primary">เพิ่มอุบัติเหตุจริง</button><button id="ownerReload" class="btn btn-secondary">โหลดรายการใหม่</button><label>หมวด<select id="ownerCategoryFilter"><option value="media">สื่อความปลอดภัย</option><option value="comic">การ์ตูน</option></select></label><label><input type="checkbox" id="ownerTrash">ดูถังพัก</label></div>
      <div class="owner-layout"><form id="ownerEditor" class="owner-panel"><h3>เพิ่มสื่อ / การ์ตูน</h3><label>ชื่อเรื่อง<input id="ownerTitle" maxlength="160" required></label><label>หมวด<select id="ownerType"><option value="media">สื่อความปลอดภัย</option><option value="comic">การ์ตูน</option></select></label><label>ภาพ 1–30 ภาพ<input id="ownerImages" type="file" accept="image/png,image/jpeg,image/webp" multiple required></label><p class="owner-note">PNG / JPG / WebP ไม่เกิน 10 MB ต่อภาพ ปรับลำดับหน้าก่อนเพิ่มได้</p><ol id="ownerFiles" class="owner-page-list"></ol><button class="btn btn-primary">เพิ่มรายการ</button></form><section id="ownerList" class="owner-list"></section></div></div>
      <button id="ownerLogout" type="button" class="btn btn-secondary" hidden>ออกจากระบบ</button>`;
    document.body.append(dialog);
    const confirm=node('dialog');confirm.id='ownerConfirm';confirm.className='owner-dialog';confirm.innerHTML='<p id="ownerConfirmTitle"></p><p class="owner-note">รายการจะหายจากคลังสาธารณะและกู้คืนได้ ลิงก์ภาพที่แชร์ไว้ก่อนหน้ายังเปิดได้ตามการตั้งค่าเดิม</p><button id="ownerConfirmCancel" class="btn btn-secondary">เก็บไว้</button> <button id="ownerConfirmMove" class="btn btn-primary">ย้ายไปถังพัก</button>';document.body.append(confirm);
    const rename=node('dialog');rename.id='ownerRename';rename.className='owner-dialog';rename.innerHTML='<form id="ownerRenameForm"><h3>แก้ชื่อเรื่อง</h3><input id="ownerRenameId" type="hidden"><label>ชื่อเรื่อง<input id="ownerRenameTitle" maxlength="160" required></label><button class="btn btn-primary">บันทึก</button> <button type="button" id="ownerRenameCancel" class="btn btn-secondary">ยกเลิก</button></form>';document.body.append(rename);
    $('ownerClose').onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
    $('ownerEmailForm').onsubmit=login;$('ownerCodeForm').onsubmit=verify;$('ownerEditor').onsubmit=upload;
    $('ownerImages').onchange=()=>{try{const selection=[...$('ownerImages').files];core.validateFiles(selection);files=selection;renderFiles();status('ตรวจลำดับภาพก่อนเพิ่มรายการ');}catch(e){files=[];$('ownerImages').value='';renderFiles();status(e.message,true);}};
    $('ownerTrash').onchange=renderOwner;$('ownerCategoryFilter').onchange=renderOwner;
    $('ownerReload').onclick=()=>run(async()=>{await requireOwner();status('โหลดข้อมูลล่าสุดแล้ว');});
    $('ownerLogout').onclick=async()=>{await cloud().auth.signOut();items=[];files=[];$('ownerEditor').reset();renderFiles();signed.clear();status('ออกจากระบบแล้ว');};
    $('ownerAddIncident').onclick=async()=>{try{if(!await checkOwner())throw Error('กรุณาเข้าสู่ระบบใหม่');dialog.close();showPage('incidentmap');openIncidentEntry();}catch(e){status(e.message,true);}};
    $('ownerConfirmCancel').onclick=()=>confirm.close();$('ownerConfirmMove').onclick=()=>{const item=items.find(m=>m.id===confirm.dataset.itemId);confirm.close();if(item)run(()=>update(item,{deleted_at:new Date().toISOString()}));};
    $('ownerRenameCancel').onclick=()=>rename.close();$('ownerRenameForm').onsubmit=e=>{e.preventDefault();const item=items.find(m=>m.id===$('ownerRenameId').value);try{const title=core.title($('ownerRenameTitle').value);rename.close();if(item)run(()=>update(item,{title}));}catch(err){status(err.message,true);}};
    document.querySelectorAll('[onclick*="ownerEntry"]').forEach(b=>b.onclick=openOwner);
    window.renderSharkyMedia=loadPublic;window.openSharkyReader=index=>openReader(index,0);window.sharkyReaderMove=readerMove;window.submitIncidentEntry=ownerIncident;
    const originalOpen=window.openIncidentEntry;
    window.openIncidentEntry=function(){if(!owner){openOwner();return;}originalOpen();};
    const previousShowPage=window.showPage;window.showPage=function(id){previousShowPage(id);if(id==='sharkymedia')loadPublic(category);};
    if(cfg.readOnly)status('โหมดทดสอบ: อ่านข้อมูลจริง แต่ปิดการบันทึก');
    updateOwnerUi();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
