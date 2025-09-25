/** roomId -> Set<WebSocket> */
const rooms = new Map();


export function getOrCreateRoom(id) {
if (!rooms.has(id)) rooms.set(id, new Set());
    return rooms.get(id);
}


export function leaveRoom(id, ws) {
    const room = rooms.get(id);
    if (!room) return;
    room.delete(ws);
    if (room.size === 0) rooms.delete(id);
}


export function broadcast(roomId, msgObj, exclude) {
    const room = rooms.get(roomId);
    if (!room) return;
    const payload = JSON.stringify(msgObj);
    for (const client of room) {
        if (client === exclude) continue;
        if (client.readyState === 1) {
            const ok = client.send(payload);
            // if (!ok) backpressure handling could go here
        }
    }
}


export function roomSize(roomId) {
    const room = rooms.get(roomId);
    return room ? room.size : 0;
}