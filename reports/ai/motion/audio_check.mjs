// 음소거된 헤드리스 Chrome에서 재생 버튼을 눌러 음악·타임라인 동기화와 오류만 검사한다(소리 없음).
// 사용: node audio_check.mjs report_writing_editorial.html [초]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || 'report_writing_editorial.html';
const secs = Number(process.argv[3] || 8);
const PORT = 9800 + Math.floor(Math.random() * 300);
const chrome = spawn(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ['--headless=new', `--remote-debugging-port=${PORT}`, '--mute-audio', '--autoplay-policy=no-user-gesture-required',
   '--window-size=1920,1080', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'rkaudio-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {} await sleep(250); }
const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map(); const errors = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value || a.description).join(' ')); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: pathToFileURL(join(here, file)).href }); await sleep(2500);
await ev("document.getElementById('play').click(); true");
if (process.argv[4]) { await sleep(1500); await ev(`Tone.Transport.seconds = ${Number(process.argv[4])}; true`); }
await sleep(secs * 1000);
const st = await ev(`({ ctx: Tone.context.state, transport: Tone.Transport.state, audioSec: +Tone.Transport.seconds.toFixed(2), timelineSec: +__tl.time().toFixed(2) })`);
await ev('Tone.Transport.stop(); true');
console.log(JSON.stringify(st), errors.length ? '\nERRORS: ' + errors.join(' | ') : '\nno errors');
ws.close(); chrome.kill(); process.exit(0);
