/** All incident writes must pass this gate, including apiPostReport routes.
 * Script Properties required: ROAD_SUPABASE_URL, ROAD_SUPABASE_PUBLIC_KEY.
 * Only the public key belongs here. Never log access tokens or auth responses.
 */
function roadRequireOwner_(accessToken) {
  var token = typeof accessToken === 'string' ? accessToken : '';
  if (!token || token.length > 8192 || !/^[A-Za-z0-9_.-]+$/.test(token)) {
    throw Error('กรุณาเข้าสู่ระบบเจ้าของก่อนเพิ่มอุบัติเหตุ');
  }
  var props = PropertiesService.getScriptProperties();
  var url = String(props.getProperty('ROAD_SUPABASE_URL') || '').replace(/\/$/, '');
  var key = props.getProperty('ROAD_SUPABASE_PUBLIC_KEY');
  if (url !== 'https://selohymkkwvldhtohtbm.supabase.co' || !key) {
    throw Error('ยังไม่ได้ตั้งค่าการตรวจสิทธิ์เจ้าของ');
  }
  var headers = {apikey:key, Authorization:'Bearer '+token};
  var identity = UrlFetchApp.fetch(url+'/auth/v1/user', {
    method:'get', headers:headers, muteHttpExceptions:true, followRedirects:false
  });
  if (identity.getResponseCode() !== 200) throw Error('การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  var user;
  try { user=JSON.parse(identity.getContentText()); } catch(e) { throw Error('ตรวจบัญชีเจ้าของไม่สำเร็จ'); }
  if (!user.id || user.is_anonymous === true) throw Error('บัญชีนี้ไม่มีสิทธิ์เจ้าของ');
  var response = UrlFetchApp.fetch(url+'/rest/v1/rpc/is_road_owner', {
    method:'post', contentType:'application/json', payload:'{}', headers:headers,
    muteHttpExceptions:true, followRedirects:false
  });
  if (response.getResponseCode() !== 200 || response.getContentText().trim() !== 'true') {
    throw Error('บัญชีนี้ไม่มีสิทธิ์เจ้าของ หรือยังตรวจสิทธิ์ไม่ได้');
  }
  return user.id;
}
