const uWS = require('uWebSockets.js');
const { nanoid } = require('nanoid');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const htmlPath = path.join(__dirname, '..', 'client', 'index.html');
const jsPath   = path.join(__dirname, '..', 'client', 'client.js');

function withCommonHeaders(res) {
  // на майбутнє: WASM + threads (SAB) для клієнтської фізики
  res.writeHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.writeHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  return res;
}
function sendFile(res, filePath, contentType) {
  try {
    const buf = fs.readFileSync(filePath);
    withCommonHeaders(res)
      .writeHeader('Content-Type', contentType)
      .end(buf);
  } catch {
    withCommonHeaders(res).writeStatus('404 Not Found').end('Not found');
  }
}

const app = uWS.App();

function publishToRoom(roomId, payload) {
  try { 
    app.publish(`room:${roomId}`, JSON.stringify(payload)); 
  }
  catch (e) { 
    console.log("noticed you have publish problems, mate here you go:", e)
  }
}

// WS: /ws/room/:id (через path, без query)
app.ws('/ws/room/*', {
  upgrade: (res, req, context) => {
    const url = req.getUrl();
    const prefix = '/ws/room/';
    if (!url.startsWith(prefix)) {
      return withCommonHeaders(res).writeStatus('400 Bad Request').end('bad ws path');
    }
    const roomId = decodeURIComponent(url.slice(prefix.length));
    console.log("we have got this id", roomId);
    if (!roomId) {
      return withCommonHeaders(res).writeStatus('400 Bad Request').end('room required');
    }
    const userId = nanoid(10);

    const secKey     = req.getHeader('sec-websocket-key');
    const protocol   = req.getHeader('sec-websocket-protocol');
    const extensions = req.getHeader('sec-websocket-extensions');

    // userData стане доступним в open/message/close
    res.upgrade({ roomId, userId }, secKey, protocol, extensions, context);
  },

  open: (ws) => {
    const { roomId, userId } = ws.getUserData();
    ws.subscribe(`room:${roomId}`);
    publishToRoom(roomId, { type: 'user:joined', roomId, userId });
  },

  message: (ws, ab) => {
    const { roomId, userId } = ws.getUserData();
    let msg; try { msg = JSON.parse(Buffer.from(ab).toString()); } catch { return; }
    if (msg?.type === 'chat:message' && typeof msg.text === 'string') {
      publishToRoom(roomId, { type: 'chat:message', roomId, userId, text: msg.text, ts: Date.now() });
    }
  },

  close: (ws) => {
    const { roomId, userId } = ws.getUserData();
    publishToRoom(roomId, { type: 'user:left', roomId, userId });
  },

  sendPingsAutomatically: true
})

// HTTP: / → 302 на /room/<randomId>
app.get('/', (res, req) => {
  const roomId = nanoid(8);
  const host = req.getHeader('host') || `localhost:${PORT}`;
  console.log("room id to redirect:", roomId)
  res
    .writeStatus('302 Found')
    .writeHeader('Location', `/room/${roomId}`)
    .end();
})

// Сторінка кімнати + клієнтський скрипт
app.get('/room/:id', (res, req) => sendFile(res, htmlPath, 'text/html; charset=utf-8'))
app.get('/client.js', (res, req) => sendFile(res, jsPath,   'application/javascript; charset=utf-8'))

app.listen(PORT, (ok) => {
  if (ok) {
    console.log(`Listening on http://localhost:${PORT}`);
    console.log(`WS path example: ws://localhost:${PORT}/ws/room/<id>`);
  } else {
    console.error('Failed to listen');
  }
});
