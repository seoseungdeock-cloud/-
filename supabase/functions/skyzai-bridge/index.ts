// SKYZAI(song_mu) 연결 창구 서버 함수 (2026-11-18).
//
// SKYZAI 의 메신저 화면이 스카이넷을 저장소로 쓴다. SKYZAI 서버는 이미 대륜탑으로 로그인한 사람의 사번을 알고 있으므로,
// 이 함수가 (1) 그 사번의 스카이넷 계정을 찾거나 만들고 (2) 그 사람의 세션 토큰을 돌려준다. SKYZAI 서버는 그 토큰으로
// PostgREST(rpc skyzai_*)·Storage 를 '그 사람으로서' 부른다 — 권한은 앱과 똑같이 RLS·auth.uid() 가 지킨다.
//
// 호출자 확인: X-Bridge-Key 헤더 = DAERYUNTOP_BRIDGE_KEY (SKYZAI 쪽 SKYNET_BRIDGE_KEY 와 같은 값. 이미 쓰는 공유 비밀을 그대로 쓴다).
// 키가 없으면 창구는 닫혀 있다(404). 비밀번호는 받지도 저장하지도 않는다 — 대륜탑 인증은 SKYZAI 가 이미 했다.
//
// 요청(POST JSON)
//   { action: 'session', member: { admin_id, name?, position?, department?, branch?, is_lawyer? } }
//     → { ok, user_id, login_id, access_token, expires_at }
//   { action: 'ensure', members: [{ admin_id, name?, ... }] }   사번들의 계정을 만들어 두고 id 를 돌려준다(초대·그룹 만들기용)
//     → { ok, users: { [admin_id]: user_id } }
//   { action: 'monitor', what: 'stats' | 'rooms' | 'messages', actor: 사번, ...인자 }   SKYZAI 어드민 「메신저」 탭 (2026-11-29)
//     stats    { from, to? }                   → { ok, data: skyzai_monitor_stats }
//     rooms    { q?, from?, limit? }           → { ok, data: skyzai_monitor_rooms }
//     messages { room, before?, limit? }       → { ok, data: skyzai_monitor_messages }   대화 원문 — audit_log 에 'monitor.messages' 로 남긴다
//     행 보안 밖(service_role)에서 읽는다. 누가 볼 수 있는지는 SKYZAI 어드민 콘솔 명단이 정하고, 여기는 키만 확인한다.
//
// 배포: index.ts 를 서버 /opt/skynet/volumes/functions/skyzai-bridge/ 에 복사하고 docker compose restart functions.
import { createClient } from 'npm:@supabase/supabase-js@2';

const LOGIN_DOMAIN = 'rightnow.local';
const ID_RE = /^[a-zA-Z0-9._-]{3,30}$/;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bridge-key',
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (code: string, reason: string, status = 400) => reply({ ok: false, code, reason }, status);

type Member = { admin_id?: string; name?: string; position?: string; department?: string; branch?: string; is_lawyer?: boolean };

function authorized(req: Request): boolean {
  const key = Deno.env.get('DAERYUNTOP_BRIDGE_KEY')?.trim();
  const given = req.headers.get('x-bridge-key')?.trim();
  if (!key || !given || key.length !== given.length) return false;
  // 길이가 같을 때만 글자별 비교 (타이밍 차이를 줄임)
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

const randomPassword = () => {
  const b = new Uint8Array(32); crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
};

type Admin = ReturnType<typeof createClient>;

/** 사번의 스카이넷 계정을 찾거나 만든다 (daeryuntop-login 의 3단계와 같은 규칙). 돌려주는 값은 profiles.id. */
async function ensureUser(admin: Admin, m: Member): Promise<{ id: string; loginId: string } | { error: string }> {
  const rawId = (m.admin_id ?? '').trim();
  if (!ID_RE.test(rawId)) return { error: '사번 형식이 올바르지 않습니다.' };
  const loginId = rawId.toLowerCase();
  const email = `${loginId}@${LOGIN_DOMAIN}`;
  const nickname = (m.name || rawId).trim().slice(0, 30);

  const { data: prof } = await admin.from('profiles').select('id, active, role, nickname').eq('login_id', loginId).maybeSingle();
  if (prof && !prof.active) return { error: '사용이 중지된 계정입니다.' };
  if (prof) {
    const patch: Record<string, unknown> = {};
    if (nickname && m.name && nickname !== prof.nickname) patch.nickname = nickname;
    if (m.position) patch.title = m.position;
    if (m.department) patch.dept = m.department;
    if (m.branch) patch.branch = m.branch;
    if (prof.role === 'client') patch.role = m.is_lawyer ? 'lawyer' : 'staff';
    if (Object.keys(patch).length) await admin.from('profiles').update(patch).eq('id', prof.id);
    return { id: prof.id as string, loginId };
  }

  let userId: string | undefined;
  const { data: made, error } = await admin.auth.admin.createUser({ email, password: randomPassword(), email_confirm: true });
  if (made?.user) {
    userId = made.user.id;
  } else if (/already|exists|registered/i.test(error?.message ?? '')) {
    const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    userId = link?.user?.id;
  }
  if (!userId) return { error: '계정을 만들지 못했습니다.' };
  const { error: pe } = await admin.from('profiles').upsert({
    id: userId, login_id: loginId, nickname,
    role: m.is_lawyer ? 'lawyer' : 'staff', firm: '대륜',
    title: m.position || null, dept: m.department || null, branch: m.branch || null,
  }, { onConflict: 'id' });
  if (pe) { console.error('[skyzai-bridge] profile upsert', pe.message); return { error: '계정 정보를 만들지 못했습니다.' }; }
  return { id: userId, loginId };
}

/** 그 사람의 세션 — 일회용 로그인 토큰을 만들어 바로 확인하면 access_token 이 나온다 (앱의 verifyOtp 와 같은 길). */
async function sessionFor(admin: Admin, loginId: string) {
  const email = `${loginId}@${LOGIN_DOMAIN}`;
  const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = link?.properties?.hashed_token;
  if (le || !tokenHash) { console.error('[skyzai-bridge] generateLink', le?.message); return null; }
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (error || !data.session) { console.error('[skyzai-bridge] verifyOtp', error?.message); return null; }
  return { access_token: data.session.access_token, expires_at: data.session.expires_at ?? null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!authorized(req)) return reply({ error: 'not found' }, 404);
  if (req.method !== 'POST') return fail('method', '허용되지 않는 요청입니다.', 405);
  let body: { action?: string; member?: Member; members?: Member[]; what?: string; actor?: string;
              from?: string; to?: string; q?: string; limit?: number; room?: string; before?: number };
  try { body = await req.json(); } catch { return fail('bad_request', '요청을 읽을 수 없습니다.'); }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  if (body.action === 'session') {
    const r = await ensureUser(admin, body.member ?? {});
    if ('error' in r) return fail('provision', r.error);
    const s = await sessionFor(admin, r.loginId);
    if (!s) return fail('session', '세션을 만들지 못했습니다.');
    await admin.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', r.id);
    return reply({ ok: true, user_id: r.id, login_id: r.loginId, ...s });
  }

  if (body.action === 'ensure') {
    const list = Array.isArray(body.members) ? body.members.slice(0, 200) : [];
    const users: Record<string, string> = {};
    for (const m of list) {
      const r = await ensureUser(admin, m);
      if (!('error' in r)) users[(m.admin_id ?? '').trim()] = r.id;
    }
    return reply({ ok: true, users });
  }

  if (body.action === 'monitor') {
    const actor = (body.actor ?? '').trim();
    if (!ID_RE.test(actor)) return fail('bad_request', '요청한 사람의 사번이 없습니다.');
    const ts = (v?: string) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
    const lim = (v: number | undefined, d: number) => Math.max(1, Math.min(Number(v) || d, 500));
    let r;
    if (body.what === 'stats') {
      r = await admin.rpc('skyzai_monitor_stats', { p_from: ts(body.from), p_to: ts(body.to) });
    } else if (body.what === 'rooms') {
      r = await admin.rpc('skyzai_monitor_rooms', { p_q: (body.q ?? '').toString().slice(0, 60) || null, p_from: ts(body.from), p_limit: lim(body.limit, 100) });
    } else if (body.what === 'messages') {
      const room = (body.room ?? '').toString();
      if (!/^[0-9a-f-]{36}$/i.test(room)) return fail('bad_request', '방을 찾을 수 없습니다.');
      r = await admin.rpc('skyzai_monitor_messages', { p_room: room, p_before: body.before ? Number(body.before) : null, p_limit: lim(body.limit, 100) });
      if (!r.error) {
        const { error: le } = await admin.rpc('skyzai_monitor_log', { p_actor_login: actor.toLowerCase(), p_room: room, p_detail: { before: body.before ?? null } });
        if (le) console.error('[skyzai-bridge] monitor log', le.message);
      }
    } else {
      return fail('bad_request', '알 수 없는 요청입니다.');
    }
    if (r.error) {
      console.error('[skyzai-bridge] monitor', body.what, r.error.message);
      // 함수가 아직 없으면(마이그레이션 전) SKYZAI 가 '제공 전' 으로 안내할 수 있게 구분해 돌려준다.
      const missing = /could not find the function|does not exist/i.test(r.error.message ?? '');
      return fail(missing ? 'not_ready' : 'monitor', missing ? '스카이넷에 모니터링 함수가 아직 없습니다.' : (r.error.message || '조회하지 못했습니다.'));
    }
    return reply({ ok: true, data: r.data });
  }

  return fail('bad_request', '알 수 없는 요청입니다.');
});
