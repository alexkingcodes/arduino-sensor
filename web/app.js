const droppedEl = document.getElementById('dropped');
const mpmEl = document.getElementById('mpm');
const chart = document.getElementById('chart');
const series = document.getElementById('series');

let data = [];          // array of {t, v}
const MAX_POINTS = 5000;

function updateSeries() {
    const view = data.slice(-600);
    const w = 800, h = 240, pad = 10;

    if (view.length === 0) {
        series.setAttribute('d', '');
        return;
    }

    const minT = view[0].t;
    const maxT = view[view.length - 1].t;
    const span = Math.max(1, maxT - minT);

    const toX = (t) => pad + ((t - minT) / span) * (w - 2 * pad);
    const toY = (v) => pad + (1 - v / 1023) * (h - 2 * pad);

    let d = '';
    for (let i = 0; i < view.length; i++) {
        const s = view[i];
        d += (i ? 'L' : 'M') + toX(s.t) + ',' + toY(s.v);
    }
    series.setAttribute('d', d);
}

async function fetchSnapshot() {
    try {
        const r = await fetch('/api/telemetry');
        const snap = await r.json();
        data = snap.data;
        droppedEl.textContent = snap.dropped;
        mpmEl.textContent = snap.mpm;
        updateSeries();
    } catch (e) {
        console.warn('snapshot failed', e);
    }
}

function startMetricsRefresh() {
    setInterval(fetchSnapshot, 1000);
}

function startWS() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/telemetry`);

    ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'sample') {
            if (data.length >= MAX_POINTS) data.shift();
            data.push({ t: msg.t, v: msg.v });
            updateSeries();
        }
    };

    ws.onclose = () => {
        // try to reconnect after a delay
        setTimeout(startWS, 1000);
    };
}

await fetchSnapshot();
startMetricsRefresh();
startWS();
