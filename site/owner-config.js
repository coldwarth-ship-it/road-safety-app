/* Public configuration only. Never place a service-role key in this file. */
window.ROAD_OWNER_CONFIG = Object.freeze({
  url: 'https://selohymkkwvldhtohtbm.supabase.co',
  key: 'sb_publishable_mj_tdZov0SpOqkJb5r3ePQ_dtGCpmPT',
  table: 'sharky_media',
  bucket: 'sharky-media',
  ownerRpc: 'is_road_owner',
  reorderRpc: 'reorder_sharky_media',
  publicBucket: true,
  readOnly: ['localhost', '127.0.0.1', 'terminal.local'].includes(location.hostname)
});
