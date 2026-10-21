// 시험용: supabase/functions/axiom 을 Node 에서 그대로 돌립니다 (Deno.serve · EdgeRuntime 흉내).
// e2e.sh 가 묶은 파일(axiom.mjs)을 불러 FN_PORT 에서 받습니다. 게이트웨이가 /functions/v1/axiom 을 여기로 넘깁니다.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const [bundle, port] = process.argv.slice(2);
const env = { SUPABASE_URL: process.env.FN_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.FN_SERVICE_KEY, PUSH_CRON_SECRET: process.env.FN_JOB_SECRET };
let handler;
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (fn) => void (handler = fn) };
globalThis.EdgeRuntime = { waitUntil: (p) => void Promise.resolve(p).catch((e) => console.error('[waitUntil]', e)) };
await import(pathToFileURL(bundle).href);

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const r = await handler(new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers, body: req.method === 'GET' ? undefined : Buffer.concat(chunks) }));
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(Number(port));
