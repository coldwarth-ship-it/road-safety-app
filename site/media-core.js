(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoadMediaCore = api;
})(typeof window === 'undefined' ? globalThis : window, function() {
  'use strict';
  const TYPES = Object.freeze({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'});
  function validateFiles(files) {
    if (!files.length || files.length > 30) throw Error('เลือกภาพ 1–30 ภาพต่อรายการ');
    for (const file of files) {
      if (!TYPES[file.type]) throw Error('รองรับภาพ PNG, JPG และ WebP');
      if (!file.size || file.size > 10 * 1024 * 1024) throw Error('ภาพต้องมีขนาดไม่เกิน 10 MB ต่อภาพ');
    }
    if (files.reduce((sum,file)=>sum+file.size,0)>100*1024*1024) throw Error('ภาพรวมต่อรายการต้องไม่เกิน 100 MB');
  }
  function title(value) {
    value=String(value||'').trim();
    if (!value || value.length>160) throw Error('กรอกชื่อ 1–160 ตัวอักษร');
    return value;
  }
  function category(value) {
    if (!['media','comic'].includes(value)) throw Error('ประเภทสื่อไม่ถูกต้อง');
    return value;
  }
  function imagePath(value) {
    return typeof value==='string' && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9]{2}-[0-9a-f-]{36}\.(png|jpg|webp)$/.test(value);
  }
  function move(items, from, to) {
    if (!Number.isInteger(from)||from<0||from>=items.length) throw Error('ไม่พบรายการ');
    to=Math.max(0,Math.min(items.length-1,Number.isFinite(Number(to))?Math.trunc(Number(to)):from));
    const result=items.slice();result.splice(to,0,result.splice(from,1)[0]);return result;
  }
  function publicItems(items) {return items.filter(item=>!item.deleted_at).sort((a,b)=>a.sort_order-b.sort_order || String(a.id).localeCompare(String(b.id)));}
  return Object.freeze({TYPES,validateFiles,title,category,imagePath,move,publicItems});
});
