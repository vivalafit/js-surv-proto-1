(function () {
  // шлях формату /room/<id>
  const parts = location.pathname.split('/').filter(Boolean);
  const roomId = parts[1]; // ["room", "<id>"]
  document.getElementById('room').textContent = roomId || '(none)';

  const logEl = document.getElementById('log');
  const log = (s) => {
    const p = document.createElement('p');
    p.textContent = s;            // безпечно (ніякого HTML-ін’єкшена)
    logEl.appendChild(p);
    logEl.scrollTop = logEl.scrollHeight;
  };

  const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${wsProto}://${location.host}/ws/room/${roomId}`);

  ws.addEventListener('open',  () => log('connected'));
  ws.addEventListener('close', () => log('disconnected'));
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === 'user:joined')  log(`→ joined: ${m.userId}`);
    if (m.type === 'user:left')    log(`← left:   ${m.userId}`);
    if (m.type === 'chat:message') log(`[${m.userId}]: ${m.text}`);
  });

  document.getElementById('f').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('msg');
    const text = input.value.trim();
    if (!text) return;
    ws.send(JSON.stringify({ type: 'chat:message', text }));
    input.value = '';
  });
})();
