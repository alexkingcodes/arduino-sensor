// CHANGE THESE IMPORTS:
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

type Sample = { t: number; v: number };

export class TelemetryHub {
    private buf: Sample[] = [];
    private head = 0;
    private filled = 0;
    private wss: WebSocketServer;
    private clients = new Set<WebSocket>();

    private msgCountThisMinute = 0;
    private lastMinuteMark = Date.now();
    private messagesPerMinute = 0;
    private dropped = 0;

    constructor(server: http.Server) {
        const size = Number(process.env.TELEM_BUFFER ?? 5000);
        this.buf = new Array(size);
        this.wss = new WebSocketServer({ noServer: true });

        server.on('upgrade', (req, socket, head) => {
            if (req.url?.startsWith('/ws/telemetry')) {
                this.wss.handleUpgrade(req, socket, head, (ws) => {
                    this.wss.emit('connection', ws, req);
                });
            } else {
                socket.destroy();
            }
        });

        this.wss.on('connection', (ws) => {
            this.clients.add(ws);
            ws.on('close', () => this.clients.delete(ws));
        });

        if (process.env.TELEM_MOCK === 'true') this.startMock();
        else this.startSerial();
    }

    private computeInstantMpm(): number {
        // Convert “messages counted since lastMinuteMark” into a per-minute rate
        const now = Date.now();
        const elapsed = Math.max(1, now - this.lastMinuteMark); // ms
        return Math.round((this.msgCountThisMinute * 60000) / elapsed);
    }

    getSnapshot(): { data: Sample[]; mpm: number; dropped: number } {
        const out: Sample[] = [];
        const n = this.filled;
        for (let i = 0; i < n; i++) {
            const idx = (this.head - n + i + this.buf.length) % this.buf.length;
            out.push(this.buf[idx]);
        }
        // Use instant rate so UI updates within 1–2 seconds
        const mpm = this.computeInstantMpm();
        return { data: out, mpm, dropped: this.dropped };
    }


    private push(sample: Sample) {
        this.buf[this.head] = sample;
        this.head = (this.head + 1) % this.buf.length;
        this.filled = Math.min(this.filled + 1, this.buf.length);

        const now = Date.now();
        if (now - this.lastMinuteMark >= 60_000) {
            this.messagesPerMinute = this.msgCountThisMinute;
            this.msgCountThisMinute = 0;
            this.lastMinuteMark = now;
        }
        this.msgCountThisMinute++;

        const payload = JSON.stringify({ type: 'sample', ...sample });
        for (const ws of this.clients) {
            if (ws.readyState !== WebSocket.OPEN) continue;
            if (ws.bufferedAmount > 256 * 1024) { this.dropped++; continue; }
            ws.send(payload);
        }
    }

    private startSerial() {
        const path = process.env.SERIAL_PORT!;
        const baudRate = Number(process.env.SERIAL_BAUD ?? 115200);
        const port = new SerialPort({ path, baudRate });              // <-- construct class

        const parser = port.pipe(new ReadlineParser({ delimiter: '\n' })); // <-- construct class

        parser.on('data', (line: string) => {
            const [tStr, vStr] = line.trim().split(',');
            const t = Number(tStr), v = Number(vStr);
            if (!Number.isFinite(t) || !Number.isFinite(v)) return;
            this.push({ t, v });
        });

        port.on('error', (e: unknown) => console.error('Serial error', e));
        console.log(`Serial listening on ${path} @ ${baudRate}`);
    }

    private startMock() {
        console.log('Telemetry mock enabled');
        let t0 = Date.now(), a = 0;
        setInterval(() => {
            const t = Date.now() - t0;
            a += 0.1;
            const v = Math.round(512 + 400 * Math.sin(a) + 50 * Math.random());
            this.push({ t, v: Math.max(0, Math.min(1023, v)) });
        }, 5);
    }
}
