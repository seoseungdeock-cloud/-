// 시험용 가짜 Supabase 입구: /rest/v1 은 로컬 PostgREST로 넘기고, 로그인·계정 함수는 흉내 냅니다.
// e2e.sh가 띄웁니다. 계정 비밀번호는 시험용 가짜 값입니다.
import { createHmac, randomUUID } from 'node:crypto';
import { createServer, request } from 'node:http';
import { execFileSync } from 'node:child_process';

const [port, restPort, secret, psqlHost, psqlPort] = process.argv.slice(2);
const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
export const sign = (claims) => {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(claims);
  return `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`;
};
const sql = (q) => execFileSync('psql', ['-h', psqlHost, '-p', psqlPort, '-U', 'postgres', '-d', 't', '-At', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8' }).trim();
const passwords = new Map(); // email → 비밀번호
const lit = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

function session(id, email) {
  const now = Math.floor(Date.now() / 1000);
  const user = { id, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  return { access_token: sign({ sub: id, role: 'authenticated', aud: 'authenticated', exp: now + 3600, email }), token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: randomUUID(), user };
}
const userOf = (req) => {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  } catch {
    return {};
  }
};
const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
};

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__seed') {
    // 시험 준비: 계정 만들기 { id, login, password, nickname, role, firm, superAdmin }
    const u = JSON.parse(raw);
    const email = `${u.login}@rightnow.local`;
    sql(`insert into auth.users (id, email) values (${lit(u.id)}, ${lit(email)}); insert into public.profiles (id, login_id, nickname, role, firm, super_admin) values (${lit(u.id)}, ${lit(u.login)}, ${lit(u.nickname)}, ${lit(u.role)}, ${lit(u.firm)}, ${u.superAdmin ? 'true' : 'false'})`);
    passwords.set(email, u.password);
    return json(res, 200, { ok: true });
  }
  if (url.pathname === '/__sql') return json(res, 200, { out: sql(raw.toString()) });
  if (url.pathname === '/auth/v1/token') {
    const { email, password } = JSON.parse(raw);
    const id = passwords.get(email) === password ? sql(`select id from auth.users where email = ${lit(email)}`) : '';
    if (!id) return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', message: 'Invalid login credentials' });
    return json(res, 200, session(id, email));
  }
  if (url.pathname === '/auth/v1/logout') return json(res, 204, {});
  if (url.pathname === '/auth/v1/user') {
    const c = userOf(req);
    return c.sub ? json(res, 200, session(c.sub, c.email).user) : json(res, 401, { message: 'no user' });
  }
  if (url.pathname === '/functions/v1/admin-accounts') {
    // supabase/functions/admin-accounts 와 같은 규칙의 간단한 흉내 (만들기만)
    const c = userOf(req);
    const me = sql(`select role from public.profiles where id = ${lit(c.sub)} and active`);
    if (me !== 'admin') return json(res, 403, { ok: false, reason: '어드민만 계정을 관리할 수 있습니다.' });
    const b = JSON.parse(raw);
    if (b.action !== 'create') return json(res, 400, { ok: false, reason: '시험에서는 만들기만 됩니다.' });
    const loginId = b.loginId.trim().toLowerCase();
    if (sql(`select count(*) from public.profiles where login_id = ${lit(loginId)}`) !== '0') return json(res, 400, { ok: false, reason: '이미 쓰는 아이디입니다.' });
    const id = randomUUID();
    const email = `${loginId}@rightnow.local`;
    sql(`insert into auth.users (id, email) values (${lit(id)}, ${lit(email)}); insert into public.profiles (id, login_id, nickname, role, firm, office_id) values (${lit(id)}, ${lit(loginId)}, ${lit(b.nickname)}, ${lit(b.role)}, ${lit(b.role === 'client' ? null : b.firm)}, ${lit(b.officeId)})`);
    passwords.set(email, b.password);
    return json(res, 200, { ok: true, userId: id });
  }
  if (url.pathname === '/functions/v1/axiom' && process.env.AXIOM_FN_PORT) {
    // AXIOM 서버 함수는 흉내가 아니라 실제 코드를 Node 로 돌린 것(axiom-fn.mjs)으로 넘깁니다
    const up = request({ host: 'localhost', port: process.env.AXIOM_FN_PORT, method: req.method, path: url.pathname + url.search, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode ?? 500, { ...r.headers, 'Access-Control-Allow-Origin': '*' });
      r.pipe(res);
    });
    up.on('error', (e) => json(res, 502, { message: String(e) }));
    up.end(raw);
    return;
  }
  if (url.pathname.startsWith('/rest/v1/')) {
    const headers = { ...req.headers, host: `localhost:${restPort}` };
    delete headers.apikey;
    const up = request({ host: 'localhost', port: restPort, method: req.method, path: url.pathname.slice('/rest/v1'.length) + url.search, headers }, (r) => {
      res.writeHead(r.statusCode ?? 500, r.headers);
      r.pipe(res);
    });
    up.on('error', (e) => json(res, 502, { message: String(e) }));
    up.end(raw);
    return;
  }
  json(res, 404, { message: `없는 주소: ${url.pathname}` });
}).listen(Number(port), () => console.log('gateway ready'));
