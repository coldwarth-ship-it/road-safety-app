/* Public configuration only. Never place a service-role key in this file. */
window.ROAD_OWNER_CONFIG = Object.freeze({
  url: 'https://selohymkkwvldhtohtbm.supabase.co',
  key: 'sb_publishable_mj_tdZov0SpOqkJb5r3ePQ_dtGCpmPT',
  table: 'road_media_items',
  bucket: 'road-media',
  ownerRpc: 'is_road_owner',
  readOnly: ['localhost', '127.0.0.1', 'terminal.local'].includes(location.hostname)
});
