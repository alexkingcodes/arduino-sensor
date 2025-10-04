import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'node:path';
import http from 'http';
import { fileURLToPath } from 'node:url';
import { TelemetryHub } from './realtime/telemetry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 3000);
const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Serve static web from ../web
const webDir = path.resolve(__dirname, '../../web');
console.log('Serving static from:', webDir);
app.use(express.static(webDir));

// Health
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Snapshot API
let hub!: TelemetryHub;
app.get('/api/telemetry', (_req, res) => {
    res.json(hub.getSnapshot());
});

// HTTP + WS
const server = http.createServer(app);
hub = new TelemetryHub(server);

server.listen(PORT, () => {
    console.log(`HTTP  : http://localhost:${PORT}`);
    console.log(`WS    : ws://localhost:${PORT}/ws/telemetry`);
});
