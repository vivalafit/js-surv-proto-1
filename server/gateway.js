import { WebSocketServer } from 'ws';
import { randomId } from './ids.js';
import { getOrCreateRoom, leaveRoom, broadcast } from './rooms.js';


export function installGateway(server) {
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });


// Heartbeat to drop dead connections
const heartbeat = setInterval(() => {
wss.clients.forEach((ws) => {
if (!ws.isAlive) return ws.terminate();
ws.isAlive = false;
try { ws.ping(); } catch {}
});
}, 15000);


server.on('close', () => clearInterval(heartbeat));


server.on('upgrade', (req, socket, head) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname !== '/ws') return socket.destroy();


        const roomId = url.searchParams.get('room');
        const playerId = url.searchParams.get('playerId') || randomId(12);
        if (!roomId) return socket.destroy();


        wss.handleUpgrade(req, socket, head, (ws) => {
        ws._roomId = roomId;
        ws._playerId = playerId;
        ws.isAlive = true;
        ws._socket?.setNoDelay?.(true);


        const room = getOrCreateRoom(roomId);
        room.add(ws);


        ws.on('pong', () => (ws.isAlive = true));


        ws.on('message', (buf) => {
        let msg = null;
        try { msg = JSON.parse(buf.toString()); } catch {}
        if (!msg || typeof msg !== 'object') return;


        if (msg.t === 'say' && typeof msg.text === 'string') {
            broadcast(roomId, {
            t: 'say', from: ws._playerId, room: roomId,
            text: msg.text.slice(0, 500), ts: Date.now()
            }, ws);
        }


        if (msg.t === 'ping') {
            ws.send(JSON.stringify({ t: 'pong', ts: Date.now() }));
            }
        });


        ws.on('close', () => {
            leaveRoom(roomId, ws);
            broadcast(roomId, { t: 'left', id: ws._playerId, room: roomId, ts: Date.now() });
        });


        // greet + presence
        ws.send(JSON.stringify({ t: 'hello', id: ws._playerId, room: roomId, ts: Date.now() }));
            broadcast(roomId, { t: 'joined', id: ws._playerId, room: roomId, ts: Date.now() }, ws);
        });
    } catch (e) {
        try { socket.destroy(); } catch {}
    }
});

}