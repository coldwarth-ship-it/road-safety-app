/* Disaster chat. Public reads; authenticated guest writes; no AI integration. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.DISASTER_CHAT_CONFIG || {};
  const PAGE_SIZE = Math.min(30, Math.max(1, cfg.pageSize || 30));
  const MAX_IMAGE = 1048576;
  const state = {
    client: null, rooms: [], roomId: 'all', messages: new Map(),
    user: null, profile: null, channel: null, generation: 0, loadVersion: 0,
    loaded: false, sending: false, savingName: false, processingImage: false,
    attachment: null, attachmentVersion: 0, cooldownUntil: 0, cooldownTimer: null,
  };
  const nodes = new Map();
  const dateFormat = new Intl.DateTimeFormat('th-TH', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  function element(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function errorText(error) {
    const message = error?.message || String(error || '');
    if (/anonymous.*(disabled|not allowed)/i.test(message)) return 'ระบบผู้เยี่ยมชมยังไม่เปิดใช้งาน กรุณาแจ้งผู้ดูแล';
    if (/rate.limit|too many requests/i.test(message) || error?.status === 429) return 'มีการเข้าใช้งานถี่เกินไป กรุณารอสักครู่แล้วลองใหม่';
    if (/กรุณารอ 5/.test(message)) return message;
    if (/ถูกระงับ/.test(message)) return message;
    if (/row.level|permission denied/i.test(message)) return 'ส่งไม่ได้ กรุณาตรวจชื่อและสถานะบัญชี หากยังพบปัญหาให้แจ้งผู้ดูแล';
    if (/relation .*does not exist|schema cache/i.test(message)) return 'ฐานข้อมูลห้องแชทยังไม่พร้อม กรุณาแจ้งผู้ดูแล';
    if (/fetch|network|timeout|load failed/i.test(message) || !navigator.onLine) return 'เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่';
    return 'ทำรายการไม่สำเร็จ กรุณาลองใหม่ หากยังพบปัญหาให้แจ้งผู้ดูแล';
  }
  function showError(text) { $('chatError').textContent = text; $('chatError').hidden = !text; }
  function setStatus(text, live = false) {
    $('connectionStatus').textContent = text;
    $('connectionStatus').classList.toggle('live', live);
  }
  function empty(title, description) {
    $('emptyState').hidden = false;
    $('emptyState').querySelector('strong').textContent = title;
    $('emptyState').querySelector('p').textContent = description;
  }
  function atBottom() {
    const view = $('messageViewport');
    return view.scrollHeight - view.scrollTop - view.clientHeight < 100;
  }
  function scrollBottom() {
    $('messageViewport').scrollTop = $('messageViewport').scrollHeight;
    $('newMessagesBtn').hidden = true;
  }
  function imageUrl(path, userId) {
    if (typeof path !== 'string' || typeof userId !== 'string') return '';
    const pieces = path.split('/');
    if (pieces.length !== 2 || pieces[0] !== userId || !/^[a-zA-Z0-9_-]+\.(jpe?g|png|webp)$/i.test(pieces[1])) return '';
    return cfg.url + '/storage/v1/object/public/' + encodeURIComponent(cfg.bucket) + '/' + pieces.map(encodeURIComponent).join('/');
  }
  function messageNode(message) {
    const own = message.user_id === state.user?.id;
    const article = element('article', 'message' + (own ? ' own' : ''));
    article.dataset.messageId = message.id;
    const meta = element('div', 'message-meta');
    meta.append(element('strong', '', message.display_name + (own ? ' · คุณ' : '')));
    const time = element('time');
    const date = new Date(message.created_at);
    if (!Number.isNaN(+date)) {
      time.dateTime = date.toISOString(); time.textContent = dateFormat.format(date);
    } else time.textContent = 'ไม่ระบุเวลา';
    meta.append(time);
    const bubble = element('div', 'message-bubble');
    const src = imageUrl(message.image_path, message.user_id);
    if (src) {
      const button = element('button', 'message-image-button');
      button.type = 'button'; button.setAttribute('aria-label', 'ดูรูปจาก ' + message.display_name);
      const img = element('img', 'message-image');
      img.alt = 'รูปสถานการณ์จาก ' + message.display_name;
      img.loading = 'lazy'; img.decoding = 'async'; img.src = src;
      img.addEventListener('error', () => {
        button.replaceWith(element('p', 'message-image-caption', 'โหลดรูปไม่ได้ หรือรูปถูกลบแล้ว'));
      }, { once: true });
      button.append(img);
      button.addEventListener('click', () => {
        $('fullImage').src = src; $('fullImage').alt = img.alt;
        $('imageDialog').showModal();
      });
      bubble.append(button, element('span', 'message-image-caption', 'แตะเพื่อดูรูป'));
    }
    if (message.body) bubble.append(element('p', 'message-text', message.body));
    article.append(meta, bubble);
    return article;
  }
  function validMessage(message) {
    return message && typeof message.id === 'string' && message.room_id === state.roomId
      && typeof message.body === 'string' && typeof message.display_name === 'string';
  }
  function renderMessages(forceBottom = false) {
    const nearBottom = atBottom();
    const rows = [...state.messages.values()].sort((a, b) => {
      return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
    }).slice(-PAGE_SIZE);
    const keep = new Set(rows.map(row => row.id));
    for (const [id, node] of nodes) {
      if (!keep.has(id)) { node.remove(); nodes.delete(id); state.messages.delete(id); }
    }
    rows.forEach((row, index) => {
      let node = nodes.get(row.id);
      if (!node) { node = messageNode(row); nodes.set(row.id, node); }
      const current = $('messages').children[index];
      if (current !== node) $('messages').insertBefore(node, current || null);
    });
    if (rows.length) $('emptyState').hidden = true;
    else if (state.loaded) empty('ยังไม่มีข้อความในห้องนี้', 'เริ่มแบ่งปันสถานการณ์ โดยระบุสถานที่ เวลา และสิ่งที่พบ');
    if (forceBottom || nearBottom) requestAnimationFrame(scrollBottom);
  }
  function refreshOwnStyle() {
    for (const [id, node] of nodes) {
      const row = state.messages.get(id);
      const own = row?.user_id === state.user?.id;
      node.classList.toggle('own', own);
      if (row) node.querySelector('.message-meta strong').textContent = row.display_name + (own ? ' · คุณ' : '');
    }
  }
  function renderRooms() {
    const search = $('roomSearch').value.trim();
    $('roomList').replaceChildren();
    const rooms = state.rooms.filter(room => room.name.includes(search));
    for (const room of rooms) {
      const button = element('button', 'room-button');
      button.type = 'button'; button.disabled = state.sending;
      button.setAttribute('aria-current', String(room.id === state.roomId));
      button.append(element('span', '', room.id === 'all' ? '💬' : '⌖'), element('span', '', room.name));
      button.addEventListener('click', () => selectRoom(room.id));
      $('roomList').append(button);
    }
    if (!rooms.length) $('roomList').append(element('p', 'no-rooms', 'ไม่พบห้องที่ค้นหา'));
    $('roomSelect').value = state.roomId;
    $('roomSelect').disabled = !state.rooms.length || state.sending;
  }
  function updateComposer() {
    const profile = state.profile;
    const canSend = !!profile && !profile.banned;
    $('messageForm').hidden = !canSend;
    $('joinChatBtn').hidden = !!profile;
    $('nameBtn').disabled = !state.client || state.savingName || state.sending;
    $('joinChatBtn').disabled = !state.client || !state.rooms.length || state.savingName;
    $('nameBtn').textContent = profile ? profile.display_name : 'ตั้งชื่อ';
    $('identityNote').textContent = profile?.banned ? 'บัญชีนี้ถูกระงับการส่งข้อความโดยผู้ดูแล'
      : profile ? 'ส่งในชื่อ ' + profile.display_name + ' · ข้อความและรูปเปิดให้ทุกคนอ่านได้'
      : 'อ่านได้ทันที · ตั้งชื่อก่อนส่งข้อความหรือรูป';
    const cooling = Date.now() < state.cooldownUntil;
    $('sendBtn').disabled = !canSend || !state.rooms.length || state.sending || state.processingImage
      || cooling || (!$('messageInput').value.trim() && !state.attachment);
    $('sendBtn').textContent = state.sending ? 'กำลังส่ง…' : cooling ? 'รอสักครู่' : 'ส่ง ↑';
    $('attachBtn').disabled = state.sending || state.processingImage;
    $('removeAttachmentBtn').disabled = state.sending;
    $('messageInput').disabled = state.sending;
    $('charCount').textContent = $('messageInput').value.length + ' / 1500';
    $('roomSelect').disabled = !state.rooms.length || state.sending;
    for (const button of $('roomList').querySelectorAll('button')) button.disabled = state.sending;
  }
  async function loadLatest(generation = state.generation, forceBottom = false) {
    if (!state.client || document.hidden) return;
    const version = ++state.loadVersion;
    const roomId = state.roomId;
    $('refreshChatBtn').disabled = true;
    try {
      const { data, error } = await state.client.from('chat_messages')
        .select('id,room_id,user_id,display_name,body,image_path,created_at')
        .eq('room_id', roomId).order('created_at', { ascending: false })
        .order('id', { ascending: false }).limit(PAGE_SIZE);
      if (generation !== state.generation || version !== state.loadVersion) return;
      if (error) throw error;
      const known = new Set((data || []).map(row => row.id));
      const newest = data?.[0]?.created_at;
      // Retain realtime arrivals newer than this response, but remove deleted/stale history.
      for (const [id, row] of state.messages) {
        if (!known.has(id) && (!newest || row.created_at <= newest)) state.messages.delete(id);
      }
      for (const row of data || []) {
        if (!validMessage(row)) continue;
        const previous = state.messages.get(row.id);
        if (previous && (previous.body !== row.body || previous.image_path !== row.image_path || previous.display_name !== row.display_name)) {
          nodes.get(row.id)?.remove(); nodes.delete(row.id);
        }
        state.messages.set(row.id, row);
      }
      const initial = !state.loaded;
      state.loaded = true; showError(''); renderMessages(forceBottom || initial);
    } catch (error) {
      if (generation !== state.generation || version !== state.loadVersion) return;
      showError(errorText(error));
      if (!state.messages.size) empty('ยังโหลดข้อความไม่ได้', 'ตรวจอินเทอร์เน็ต แล้วกดปุ่ม ↻ เพื่อลองใหม่');
    } finally {
      if (generation === state.generation && version === state.loadVersion) $('refreshChatBtn').disabled = false;
    }
  }
  function stopRealtime() {
    const channel = state.channel;
    state.channel = null;
    if (channel) state.client.removeChannel(channel).catch(() => {});
  }
  function connectRealtime() {
    if (!state.client || document.hidden || !navigator.onLine) return;
    stopRealtime();
    const generation = state.generation;
    const channel = state.client.channel('disaster-room-' + crypto.randomUUID());
    state.channel = channel;
    setStatus('กำลังเชื่อมต่อข้อความสด…');
    const handleMessage = payload => {
      if (generation !== state.generation || state.channel !== channel || !validMessage(payload.new)) return;
      const nearBottom = atBottom();
      const own = payload.new.user_id === state.user?.id;
      state.messages.set(payload.new.id, payload.new);
      const old = nodes.get(payload.new.id);
      if (old) { old.remove(); nodes.delete(payload.new.id); }
      renderMessages(own || nearBottom);
      if (!nearBottom && !own) $('newMessagesBtn').hidden = false;
      $('chatAnnouncement').textContent = 'มีข้อความใหม่ในห้อง ' + $('roomHeading').textContent;
    };
    const filter = { schema: 'public', table: 'chat_messages', filter: 'room_id=eq.' + state.roomId };
    channel.on('postgres_changes', { ...filter, event: 'INSERT' }, handleMessage)
      .on('postgres_changes', { ...filter, event: 'UPDATE' }, handleMessage)
      .on('postgres_changes', { schema: 'public', table: 'chat_messages', event: 'DELETE' }, payload => {
        if (generation !== state.generation || state.channel !== channel) return;
        if (state.messages.delete(payload.old?.id)) renderMessages();
      }).subscribe(status => {
        if (generation !== state.generation || state.channel !== channel) return;
        if (status === 'SUBSCRIBED') {
          setStatus('เชื่อมต่อสด · ข้อความล่าสุด 30 รายการ', true);
          loadLatest(generation);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setStatus('ข้อความสดยังไม่เชื่อมต่อ · กด ↻ เพื่อลองใหม่');
        }
      });
  }
  function selectRoom(id) {
    if (state.sending || !state.rooms.some(room => room.id === id)) return;
    state.roomId = id; state.generation++; state.loaded = false;
    state.messages.clear(); nodes.clear(); $('messages').replaceChildren();
    $('newMessagesBtn').hidden = true; showError('');
    $('roomHeading').textContent = state.rooms.find(room => room.id === id).name;
    empty('กำลังโหลดห้องสนทนา', 'รอสักครู่…');
    const url = new URL(location.href);
    if (id === 'all') url.searchParams.delete('room'); else url.searchParams.set('room', id);
    history.replaceState(null, '', url);
    renderRooms(); connectRealtime(); loadLatest(state.generation, true);
  }
  async function loadRooms() {
    const { data, error } = await state.client.from('chat_rooms').select('id,name');
    if (error) throw error;
    state.rooms = (data || []).filter(room => typeof room.id === 'string' && typeof room.name === 'string')
      .sort((a, b) => a.id === 'all' ? -1 : b.id === 'all' ? 1 : a.name.localeCompare(b.name, 'th'));
    if (!state.rooms.length) throw new Error('schema cache: no rooms');
    $('roomSelect').replaceChildren(...state.rooms.map(room => new Option(room.name, room.id)));
    const requested = new URL(location.href).searchParams.get('room') || 'all';
    selectRoom(state.rooms.some(room => room.id === requested) ? requested : state.rooms[0].id);
    updateComposer();
  }
  async function loadProfile(user) {
    if (!user) { state.user = null; state.profile = null; updateComposer(); return; }
    state.user = user;
    const { data, error } = await state.client.from('chat_profiles').select('id,display_name,banned').eq('id', user.id).maybeSingle();
    if (error) throw error;
    state.profile = data; updateComposer(); refreshOwnStyle();
  }
  function openNameDialog() {
    if (!state.client || state.sending) return;
    $('displayNameInput').value = state.profile?.display_name || '';
    $('nameError').textContent = '';
    $('nameDialog').showModal();
  }
  async function saveName(event) {
    event.preventDefault();
    if (state.savingName) return;
    const name = $('displayNameInput').value.trim();
    if ([...name].length < 2 || [...name].length > 40) {
      $('nameError').textContent = 'ตั้งชื่อความยาว 2–40 ตัวอักษร'; return;
    }
    state.savingName = true; $('nameError').textContent = '';
    $('saveNameBtn').disabled = true; $('closeNameBtn').disabled = true;
    $('saveNameBtn').textContent = 'กำลังเข้าห้อง…'; updateComposer();
    try {
      const { data: sessionData, error: sessionError } = await state.client.auth.getSession();
      if (sessionError) throw sessionError;
      let user = sessionData.session?.user;
      if (!user) {
        const { data, error } = await state.client.auth.signInAnonymously();
        if (error) throw error;
        user = data.user;
      }
      if (!user) throw new Error('no user');
      await loadProfile(user);
      if (state.profile?.banned) throw new Error('บัญชีนี้ถูกระงับการส่งข้อความ');
      const query = state.profile
        ? state.client.from('chat_profiles').update({ display_name: name }).eq('id', user.id)
        : state.client.from('chat_profiles').insert({ id: user.id, display_name: name });
      const { error } = await query;
      if (error) throw error;
      await loadProfile(user);
      $('nameDialog').close(); $('messageInput').focus();
    } catch (error) { $('nameError').textContent = errorText(error); }
    finally {
      state.savingName = false; $('saveNameBtn').disabled = false; $('closeNameBtn').disabled = false;
      $('saveNameBtn').textContent = 'เข้าห้องแชท'; updateComposer();
    }
  }
  function clearAttachment() {
    state.attachmentVersion++;
    if (state.attachment?.previewUrl) URL.revokeObjectURL(state.attachment.previewUrl);
    state.attachment = null; state.processingImage = false;
    $('attachmentPreview').hidden = true; $('attachmentImg').removeAttribute('src');
    $('chatImageInput').value = ''; updateComposer();
  }
  async function decodeImage(file) {
    if (typeof createImageBitmap === 'function') return createImageBitmap(file);
    const url = URL.createObjectURL(file);
    const img = new Image();
    try { img.src = url; await img.decode(); return img; }
    finally { URL.revokeObjectURL(url); }
  }
  async function compressImage(file) {
    const bitmap = await decodeImage(file);
    try {
      let maxSide = 1280;
      for (let attempt = 0; attempt < 3; attempt++) {
        const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
        canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('image decode failed');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.8, 0.65, 0.5]) {
          const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
          if (blob && blob.size <= 512000) return blob;
        }
        maxSide = Math.round(maxSide * 0.7);
      }
      throw new Error('image too large');
    } finally { bitmap.close?.(); }
  }
  async function selectImage() {
    const file = $('chatImageInput').files?.[0];
    if (!file || state.sending) return;
    clearAttachment();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      $('sendStatus').textContent = 'เลือกไฟล์ JPG, PNG หรือ WebP เท่านั้น'; return;
    }
    if (file.size > 8 * 1048576) { $('sendStatus').textContent = 'รูปต้นฉบับต้องไม่เกิน 8 MB'; return; }
    const version = ++state.attachmentVersion;
    state.processingImage = true; $('sendStatus').textContent = 'กำลังย่อรูป…'; updateComposer();
    try {
      const blob = await compressImage(file);
      if (version !== state.attachmentVersion) return;
      if (blob.size > MAX_IMAGE) throw new Error('image too large');
      const previewUrl = URL.createObjectURL(blob);
      state.attachment = { blob, previewUrl };
      $('attachmentImg').src = previewUrl;
      $('attachmentSize').textContent = 'ย่อแล้ว ' + Math.ceil(blob.size / 1024) + ' KB';
      $('attachmentPreview').hidden = false; $('sendStatus').textContent = '';
    } catch (_) {
      if (version === state.attachmentVersion) $('sendStatus').textContent = 'อ่านหรือย่อรูปไม่ได้ ลองเลือกรูป JPG, PNG หรือ WebP ใหม่';
    } finally {
      if (version === state.attachmentVersion) { state.processingImage = false; updateComposer(); }
    }
  }
  async function sendMessage(event) {
    event.preventDefault();
    if (state.sending || state.processingImage || Date.now() < state.cooldownUntil) return;
    if (!state.profile || state.profile.banned) { openNameDialog(); return; }
    const body = $('messageInput').value.trim();
    const attachment = state.attachment;
    if (!body && !attachment) return;
    const roomId = state.roomId;
    const userId = state.user.id;
    let uploadedPath = null, postStarted = false;
    state.sending = true; $('sendStatus').textContent = ''; updateComposer();
    try {
      if (!navigator.onLine) throw new Error('network offline');
      if (attachment) {
        uploadedPath = userId + '/' + crypto.randomUUID() + '.jpg';
        const { error } = await state.client.storage.from(cfg.bucket).upload(uploadedPath, attachment.blob, {
          contentType: 'image/jpeg', cacheControl: '3600', upsert: false,
        });
        if (error) { uploadedPath = null; throw error; }
      }
      postStarted = true;
      const { data, error } = await state.client.from('chat_messages').insert({
        room_id: roomId, user_id: userId, body, image_path: uploadedPath,
      }).select('id,room_id,user_id,display_name,body,image_path,created_at').single();
      if (error) {
        // Only remove uploaded files after a definitive server rejection, never after an ambiguous network response.
        if (uploadedPath && error.code && error.code !== 'PGRST116') {
          await state.client.storage.from(cfg.bucket).remove([uploadedPath]);
          uploadedPath = null;
        }
        throw error;
      }
      if (validMessage(data)) { state.messages.set(data.id, data); state.loaded = true; renderMessages(true); }
      $('messageInput').value = ''; $('messageInput').style.height = '';
      clearAttachment();
      state.cooldownUntil = Date.now() + 5000;
      clearTimeout(state.cooldownTimer);
      state.cooldownTimer = setTimeout(updateComposer, 5100);
      $('chatAnnouncement').textContent = 'ส่งข้อความแล้ว';
    } catch (error) {
      const ambiguous = postStarted && (!error.code || error.code === 'PGRST116');
      $('sendStatus').textContent = ambiguous
        ? 'ยังยืนยันการส่งไม่ได้ กด ↻ ตรวจว่าข้อความขึ้นแล้วหรือไม่ก่อนส่งซ้ำ'
        : errorText(error);
      if (/ถูกระงับ|row.level/i.test(error?.message || '')) {
        try { await loadProfile(state.user); } catch (_) { /* Preserve the original send error. */ }
      }
    } finally {
      state.sending = false; updateComposer();
      if (!state.profile?.banned) $('messageInput').focus();
    }
  }
  async function refresh() {
    if (!state.client) { location.reload(); return; }
    try {
      if (!state.rooms.length) await loadRooms();
      else { connectRealtime(); await loadLatest(); }
    } catch (error) { showError(errorText(error)); }
  }
  $('roomSearch').addEventListener('input', renderRooms);
  $('roomSelect').addEventListener('change', event => selectRoom(event.target.value));
  $('nameBtn').addEventListener('click', openNameDialog);
  $('joinChatBtn').addEventListener('click', openNameDialog);
  $('nameForm').addEventListener('submit', saveName);
  $('closeNameBtn').addEventListener('click', () => $('nameDialog').close());
  $('nameDialog').addEventListener('cancel', event => { if (state.savingName) event.preventDefault(); });
  $('refreshChatBtn').addEventListener('click', refresh);
  $('messageForm').addEventListener('submit', sendMessage);
  $('messageInput').addEventListener('input', () => {
    const input = $('messageInput'); input.style.height = 'auto';
    input.style.height = Math.min(120, input.scrollHeight) + 'px'; updateComposer();
  });
  $('messageInput').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && innerWidth > 680) {
      event.preventDefault(); if (!$('sendBtn').disabled) $('messageForm').requestSubmit();
    }
  });
  $('attachBtn').addEventListener('click', () => $('chatImageInput').click());
  $('chatImageInput').addEventListener('change', selectImage);
  $('removeAttachmentBtn').addEventListener('click', clearAttachment);
  $('newMessagesBtn').addEventListener('click', scrollBottom);
  $('messageViewport').addEventListener('scroll', () => { if (atBottom()) $('newMessagesBtn').hidden = true; });
  $('closeImageBtn').addEventListener('click', () => $('imageDialog').close());
  $('imageDialog').addEventListener('close', () => $('fullImage').removeAttribute('src'));
  $('imageDialog').addEventListener('click', event => { if (event.target === $('imageDialog')) $('imageDialog').close(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopRealtime(); setStatus('พักการรับข้อความขณะไม่ได้เปิดหน้านี้'); }
    else if (state.rooms.length) { connectRealtime(); loadLatest(); }
  });
  window.addEventListener('offline', () => { stopRealtime(); setStatus('ออฟไลน์ · ตรวจอินเทอร์เน็ตแล้วกด ↻'); });
  window.addEventListener('online', () => { if (!document.hidden) refresh(); });
  window.addEventListener('pagehide', stopRealtime);
  window.addEventListener('pageshow', event => { if (event.persisted && state.rooms.length) refresh(); });
  async function init() {
    try {
      if (!window.supabase?.createClient || !cfg.url || !cfg.publishableKey) throw new Error('client unavailable');
      state.client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
        auth: { storageKey: 'faophai-chat-session-v1', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
      state.client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') { state.user = null; state.profile = null; updateComposer(); refreshOwnStyle(); }
        if (event === 'TOKEN_REFRESHED' && session?.user) state.user = session.user;
      });
      await loadRooms();
      const { data, error } = await state.client.auth.getSession();
      if (error) throw error;
      if (data.session?.user) await loadProfile(data.session.user);
    } catch (error) {
      showError(errorText(error));
      if (!state.rooms.length) {
        empty('ยังเชื่อมต่อห้องแชทไม่ได้', 'ตรวจอินเทอร์เน็ต แล้วกด ↻ เพื่อลองใหม่');
        setStatus('ยังไม่เชื่อมต่อ');
      }
    } finally { updateComposer(); }
  }
  init();
})();
