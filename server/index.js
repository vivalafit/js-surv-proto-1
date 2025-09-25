// server/index.js
import http from 'node:http';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installGateway } from './gateway.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const PORT = process.env.PORT || 3000;
const app = express();


// Serve static client
app.use(express.static(path.join(__dirname, '..', 'public')));


// Optional: pretty root redirect to a generated room is handled on client, but serve index anyway
app.get(['/','/r/:roomId'], (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});


const server = http.createServer(app);


// Attach WebSocket gateway (handles /ws upgrades)
installGateway(server);


server.listen(PORT, () => { 
console.log(`HTTP on http://localhost:${PORT}`);
});