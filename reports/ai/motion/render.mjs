// HTML 모션그래픽 → 프레임 캡처 / MP4 렌더러 (Chrome DevTools Protocol, 추가 패키지 불필요)
// 사용: node render.mjs frames 5,25,40          → preview_<t>.png
//       node render.mjs video [fps] [out.mp4]    → 무음 MP4 (ffmpeg 필요)
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333 + Math.floor(Math.random() * 500);
const [, , mode = 'frames', arg1 = '5', arg2] = process.argv;
const url = pathToFileURL(join(here, process.env.MOTION_FILE || 'ai_rsi_motion.html')).href + '?render';

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--hide-scrollbars', '--mute-audio',
  '--force-device-scale-factor=1', '--window-size=1920,1080', '--disable-gpu-vsync', '--run-all-compositor-stages-before-draw',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'rkmotion-'))}`, 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* 아직 기동 중 */ }
    await sleep(250);
  }
  throw new Error('Chrome DevTools 연결 실패');
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0; const pending = new Map(); const waiters = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  else if (m.method) waiters.filter((w) => w.method === m.method).forEach((w) => w.res(m.params));
});
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const once = (method) => new Promise((res) => waiters.push({ method, res }));
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const loaded = once('Page.loadEventFired');
await send('Page.navigate', { url });
await loaded;
await evaluate('window.__ready');
await sleep(1500); // 웹폰트 안정화
const DUR = await evaluate('window.__duration');

async function shot(t, format = 'png', quality) {
  await evaluate(`window.__seek(${t}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  const r = await send('Page.captureScreenshot', { format, quality, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 }, captureBeyondViewport: false });
  return Buffer.from(r.data, 'base64');
}

if (mode === 'frames') {
  for (const t of arg1.split(',').map(Number)) {
    const f = join(here, `${(process.env.MOTION_FILE || 'ai_rsi').split('.')[0]}_p${String(t).replace('.', '_')}.png`);
    writeFileSync(f, await shot(t));
    console.log('saved', f);
  }
} else {
  const fps = Number(arg1) || 30;
  const out = resolve(here, arg2 || 'ai_rsi_motion_noaudio.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const total = Math.round(DUR * fps);
  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    const buf = await shot(i / fps, 'jpeg', 94);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % (fps * 5) === 0) console.log(`frame ${i}/${total}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('video', out);
}
ws.close(); chrome.kill();
process.exit(0);
