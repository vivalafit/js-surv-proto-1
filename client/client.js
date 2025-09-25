function randId(n = 12) {
    const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < n; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
}


function ensureRoomInUrl() {
    const { pathname, origin } = window.location;
    const parts = pathname.split('/').filter(Boolean); // e.g. ["r","abcd123"]
    if (parts[0] === 'r' && parts[1]) return parts[1];
    const newRoom = randId(8);
    const newUrl = `${origin}/r/${newRoom}`;
    window.history.replaceState({}, '', newUrl);
    return newRoom;
}


const roomId = ensureRoomInUrl();
const playerId = localStorage.getItem('playerId') || (localStorage.setItem('playerId', randId(12)), localStorage.getItem('playerId'));


document.getElementById('room').textContent = roomId;


document.getElementById('copy').onclick = async () => {
    await navigator.clipboard.writeText(window.location.href);
};


const proto = location.protocol === 'https:' ? 'wss' : 'ws';
const wsUrl = `${proto}://${location.host}/ws?room=${encodeURIComponent(roomId)}&playerId=${encodeURIComponent(playerId)}`;
const ws = new WebSocket(wsUrl);


const logEl = document.getElementById('log');
const MAX_LOG_LINES = 500;
function log(...a) {
    const line = document.createElement('div');
    line.textContent = a.join(' ');
    logEl.appendChild(line);
    while (logEl.childNodes.length > MAX_LOG_LINES) {
        logEl.removeChild(logEl.firstChild);
    }
    logEl.scrollTop = logEl.scrollHeight;
}


ws.addEventListener('open', () => log('WS: open'));
ws.addEventListener('close', () => log('WS: close'));
ws.addEventListener('message', (e) => {
try {
    const msg = JSON.parse(e.data);
    if (msg.t === 'hello') log(`> hello: you=${msg.id} room=${msg.room}`);
    else if (msg.t === 'joined') log(`> joined: ${msg.id}`);
    else if (msg.t === 'left') log(`> left: ${msg.id}`);
    else if (msg.t === 'say') log(`[${new Date(msg.ts).toLocaleTimeString()}] ${msg.from}: ${msg.text}`);
    else if (msg.t === 'pong') log(`> pong ${msg.ts}`);
    else log('> msg', e.data);
} catch { log('> raw', e.data); }
});


// send message
const input = document.getElementById('text');
document.getElementById('send').onclick = () => {
const text = input.value.trim();
if (!text) return;
ws.send(JSON.stringify({ t: 'say', text }));
input.value = '';
};


// Enter to send
input.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('send').click(); });


// Heartbeat keepalive (pause/resume on tab visibility)
const PING_INTERVAL = 15000;
const pingPayload = JSON.stringify({ t: 'ping' });
let pingTimer = null;


function startHeartbeat() {
    if (pingTimer) return;
    pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            try { ws.send(pingPayload); } catch {}
        }
    }, document.hidden ? PING_INTERVAL * 2 : PING_INTERVAL);
}


function stopHeartbeat() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
}


document.addEventListener('visibilitychange', () => {
    stopHeartbeat();
    startHeartbeat();
});


ws.addEventListener('open', startHeartbeat);
ws.addEventListener('close', stopHeartbeat);
ws.addEventListener('error', stopHeartbeat);