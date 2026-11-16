// 대륜탑 사번 로그인 서버 함수 (2026-11-16).
//
// 앱이 사번·비밀번호를 보내면 (1) 대륜탑 인증 서버(AEGIS)에 확인하고, (2) 통과한 사번의 Supabase 계정을 찾거나 만들고
// (3) 그 계정의 일회용 로그인 토큰(magic link 의 token_hash)을 돌려준다. 앱은 그 토큰으로 verifyOtp 를 불러 세션을 연다.
// 비밀번호는 Supabase 에 저장하지 않는다 — 대륜탑이 바꾸면 그대로 따라간다.
//
// 직위·지점·부서는 SKYZAI 의 연결 창구(DAERYUNTOP_BRIDGE_URL, 선택)에서 받아 프로필에 채운다. 창구가 없거나 실패하면
// AEGIS 가 주는 이름만으로 만든다. 의뢰인 등 대륜탑에 없는 계정은 이 함수가 ok:false(code 'not_staff') 로 답하고,
// 앱이 종전의 비밀번호 로그인으로 넘어간다.
//
// 비밀값(함수 설정에서만): SUPABASE_SERVICE_ROLE_KEY(자동), DAERYUNTOP_BRIDGE_URL, DAERYUNTOP_BRIDGE_KEY(선택).
// verify_jwt 는 false 로 배포한다 — 로그인 전이라 JWT 가 없다: `supabase functions deploy daeryuntop-login --no-verify-jwt`
import { createClient } from 'npm:@supabase/supabase-js@2';

const LOGIN_DOMAIN = 'rightnow.local';
const AEGIS_LOGIN = 'https://aegis.daeryunlaw.com/api/users/loginProc';
const ID_RE = /^[a-zA-Z0-9._-]{3,30}$/;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
// 실패도 200 으로 돌려준다 — 앱의 functions.invoke 가 본문을 그대로 읽게 하려고(비-2xx 는 본문이 오류 객체에 숨는다).
const fail = (code: string, reason: string) => reply({ ok: false, code, reason });

type Member = { name?: string; position?: string; branch?: string; department?: string; is_lawyer?: boolean };

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); });
  try { return await Promise.race([p, timeout]); } finally { clearTimeout(t); }
}

/** 대륜탑 인증 — SKYZAI(song_mu auth._aegis_login_proc)와 같은 호출. 성공이면 {isLogin:true, name, jwt}. */
async function aegisLogin(adminId: string, password: string): Promise<{ ok: boolean; name?: string }> {
  try {
    const res = await withTimeout(fetch(AEGIS_LOGIN, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; Skynet/1.0)' },
      body: JSON.stringify({ adminId, password, auth_type: 'ai_service' }),
    }), 10_000);
    if (!res.ok) return { ok: false };
    const data = await res.json().catch(() => ({}));
    return data?.isLogin ? { ok: true, name: typeof data.name === 'string' ? data.name : undefined } : { ok: false };
  } catch (e) {
    console.error('[daeryuntop-login] aegis error', String(e));
    return { ok: false };
  }
}

/** SKYZAI 연결 창구에서 직위·지점·부서·변호사 여부. 없거나 실패하면 빈 값. */
async function memberInfo(adminId: string): Promise<Member> {
  const base = Deno.env.get('DAERYUNTOP_BRIDGE_URL')?.replace(/\/$/, '');
  const key = Deno.env.get('DAERYUNTOP_BRIDGE_KEY');
  if (!base || !key) return {};
  try {
    const res = await withTimeout(fetch(`${base}/api/bridge/member?admin_id=${encodeURIComponent(adminId)}`, {
      headers: { 'X-Bridge-Key': key, Accept: 'application/json' },
    }), 5_000);
    if (!res.ok) return {};
    const d = await res.json();
    return d && d.ok ? (d.member as Member) ?? {} : {};
  } catch (e) {
    console.error('[daeryuntop-login] bridge error', String(e));
    return {};
  }
}

const randomPassword = () => {
  const b = new Uint8Array(32); crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('method', '허용되지 않는 요청입니다.');

  let body: { loginId?: string; password?: string };
  try { body = await req.json(); } catch { return fail('bad_request', '요청을 읽을 수 없습니다.'); }
  const rawId = (body.loginId ?? '').trim();
  const password = body.password ?? '';
  if (!ID_RE.test(rawId) || !password) return fail('bad_request', '사번과 비밀번호를 입력해 주세요.');
  const loginId = rawId.toLowerCase();
  const email = `${loginId}@${LOGIN_DOMAIN}`;

  // 1) 대륜탑에 묻는다
  const auth = await aegisLogin(rawId, password);
  if (!auth.ok) return fail('not_staff', '사번 또는 비밀번호가 올바르지 않습니다.');

  // 2) 프로필 보강 정보(선택)
  const info = await memberInfo(rawId);
  const nickname = (info.name || auth.name || rawId).trim().slice(0, 30);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // 3) 계정 찾기/만들기
  const { data: prof } = await admin.from('profiles').select('id, active, role, nickname').eq('login_id', loginId).maybeSingle();
  let userId = prof?.id as string | undefined;
  if (prof && !prof.active) return fail('inactive', '사용이 중지된 계정입니다. 관리자에게 문의하세요.');

  if (!userId) {
    const { data: made, error } = await admin.auth.admin.createUser({ email, password: randomPassword(), email_confirm: true });
    if (made?.user) {
      userId = made.user.id;
    } else if (/already|exists|registered/i.test(error?.message ?? '')) {
      // 인증 계정만 있고 프로필이 없는 경우 — 링크를 만들어 id 를 알아낸다
      const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      userId = link?.user?.id;
    }
    if (!userId) return fail('provision', '계정을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
    const { error: pe } = await admin.from('profiles').upsert({
      id: userId,
      login_id: loginId,
      nickname,
      role: info.is_lawyer ? 'lawyer' : 'staff',
      firm: '대륜',
      title: info.position || null,
      dept: info.department || null,
      branch: info.branch || null,
    }, { onConflict: 'id' });
    if (pe) {
      console.error('[daeryuntop-login] profile insert', pe.message);
      return fail('provision', '계정 정보를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  } else {
    // 이름·직위·지점은 대륜탑 쪽을 따라간다. 역할(admin 등)은 건드리지 않는다.
    const patch: Record<string, unknown> = { last_login_at: new Date().toISOString() };
    if (nickname && nickname !== prof?.nickname) patch.nickname = nickname;
    if (info.position) patch.title = info.position;
    if (info.department) patch.dept = info.department;
    if (info.branch) patch.branch = info.branch;
    if (prof?.role === 'client') patch.role = info.is_lawyer ? 'lawyer' : 'staff';
    await admin.from('profiles').update(patch).eq('id', userId);
  }

  // 4) 일회용 로그인 토큰
  const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = link?.properties?.hashed_token;
  if (le || !tokenHash) {
    console.error('[daeryuntop-login] generateLink', le?.message);
    return fail('session', '로그인 세션을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  return reply({ ok: true, tokenHash, loginId });
});
