// 대륜탑 구성원 명단 동기화 (2026-11-19).
//
// 대륜탑(ERP) 데이터베이스의 구성원 표(admin_user)를 **읽기만** 해서 스카이넷 계정(auth.users + profiles)을 맞춥니다.
// 대륜탑에는 SELECT 한 번만 보내고 아무것도 쓰지 않습니다 — 연결 계정도 읽기 전용으로 만들어 두는 것을 권합니다.
//
//   · 대륜탑에 있는데 스카이넷에 없는 사번 → 계정을 만들어 둡니다 (비밀번호 없음. 로그인은 늘 대륜탑 인증을 거칩니다).
//   · 둘 다 있는 사번 → 이름·직위·부서·지점·전화·이메일을 대륜탑 값으로 맞춥니다. 역할은 변호사/직원만 직위에 따라 바꾸고, 어드민은 건드리지 않습니다.
//   · 전에 동기화로 들어왔는데 대륜탑에서 사라진(퇴사·삭제·미승인) 사번 → 사용 중지(active=false). 다시 나타나면 다시 켭니다.
//   · 손으로 만든 계정(의뢰인, 테스트 계정 등)은 건드리지 않습니다.
//
// 부르는 쪽
//   · pg_cron → public.kick_daeryuntop_sync() → 이 함수 (헤더 x-sync-secret = Vault 'daeryuntop_sync_secret')
//   · 백오피스 「대륜탑 명단 동기화」 버튼 → 어드민 세션 토큰으로 호출 (profiles.role = 'admin' 확인)
//
// 비밀값(함수 설정에서만): SUPABASE_SERVICE_ROLE_KEY(자동), DAERYUNTOP_DB_URL (postgres://읽기전용계정:비밀번호@호스트:5432/디비), DAERYUNTOP_SYNC_SECRET
// 배포: index.ts 를 서버 /opt/skynet/volumes/functions/daeryuntop-sync/ 에 복사하고 docker compose restart functions.
import { createClient } from 'npm:@supabase/supabase-js@2';
import postgres from 'npm:postgres@3';

const LOGIN_DOMAIN = 'rightnow.local';
const SOURCE = 'daeryuntop';
const ID_RE = /^[a-z0-9._-]{3,30}$/;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret' };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (code: string, reason: string, status = 400) => reply({ ok: false, code, reason }, status);

type TopMember = {
  admin_id: string; admin_name: string; position_name: string | null; department: string | null; branch_name: string | null;
  admin_tel: string | null; admin_email: string | null; created_at: string | null;
};

/** 대륜탑에서 재직 중(승인·미삭제) 구성원. SELECT 만. */
async function readDaeryuntop(): Promise<TopMember[]> {
  const url = Deno.env.get('DAERYUNTOP_DB_URL');
  if (!url) throw new Error('DAERYUNTOP_DB_URL 이 설정되지 않았습니다');
  const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 10, prepare: false, ssl: 'prefer' });
  try {
    const rows = await sql<TopMember[]>`
      select au.admin_id, au.admin_name, au.department, au.admin_tel, au.admin_email, au.created_at,
             pc.code_name as position_name, bc.code_name as branch_name
        from admin_user au
        left join common_code bc on bc.code = au.branch and bc.deleted_at is null
        left join common_code pc on au.position ~ '^[0-9]+$' and pc.code = au.position::int and pc.deleted_at is null
       where au.deleted_at is null
         and coalesce(au.is_hard_delete, false) = false
         and coalesce(au.approve_state, false) = true
         and au.admin_id is not null and length(au.admin_id) between 3 and 30`;
    return rows;
  } finally {
    await sql.end({ timeout: 3 });
  }
}

const isLawyer = (position: string | null) => !!position && /변호사/.test(position);
const clean = (v: string | null | undefined, max = 60) => {
  const t = (v ?? '').trim();
  return t ? t.slice(0, max) : null;
};
function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('method', 'POST only', 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // 1) 누가 부르나 — 예약 작업(비밀) 또는 어드민
  const secret = Deno.env.get('DAERYUNTOP_SYNC_SECRET');
  const bySecret = !!secret && req.headers.get('x-sync-secret') === secret;
  let caller = 'cron';
  if (!bySecret) {
    const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!jwt) return fail('auth', '권한이 없습니다.', 401);
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return fail('auth', '권한이 없습니다.', 401);
    const { data: prof } = await admin.from('profiles').select('role, login_id').eq('id', u.user.id).maybeSingle();
    if (prof?.role !== 'admin') return fail('auth', '어드민만 동기화할 수 있습니다.', 403);
    caller = prof.login_id ?? u.user.id;
  }

  // 2) 대륜탑 읽기
  let members: TopMember[];
  try {
    members = await readDaeryuntop();
  } catch (e) {
    console.error('[daeryuntop-sync] read', String(e));
    return fail('daeryuntop', `대륜탑에 연결하지 못했습니다: ${String((e as Error).message ?? e).slice(0, 120)}`, 502);
  }
  const byId = new Map<string, TopMember>();
  for (const m of members) {
    const id = m.admin_id.trim().toLowerCase();
    if (ID_RE.test(id)) byId.set(id, m);
  }

  // 3) 스카이넷 쪽 현재 상태
  const { data: profiles, error: pe } = await admin.from('profiles').select('id, login_id, nickname, role, title, dept, branch, phone, email, active, source');
  if (pe) return fail('db', pe.message, 500);
  const have = new Map((profiles ?? []).map((p) => [p.login_id as string, p]));

  const now = new Date().toISOString();
  const result = { added: 0, updated: 0, deactivated: 0, reactivated: 0, skipped: 0, errors: [] as string[] };

  // 4) 추가·갱신
  for (const [loginId, m] of byId) {
    const prof = have.get(loginId);
    const nickname = clean(m.admin_name, 30) ?? loginId;
    const lawyer = isLawyer(m.position_name);
    const fields = {
      nickname, title: clean(m.position_name), dept: clean(m.department), branch: clean(m.branch_name),
      phone: clean(m.admin_tel, 30), email: clean(m.admin_email, 120), joined_at: m.created_at ? String(m.created_at).slice(0, 10) : null,
    };
    try {
      if (!prof) {
        const email = `${loginId}@${LOGIN_DOMAIN}`;
        const { data: made, error } = await admin.auth.admin.createUser({ email, password: randomPassword(), email_confirm: true });
        let userId = made?.user?.id;
        if (!userId && /already|exists|registered/i.test(error?.message ?? '')) {
          const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
          userId = link?.user?.id;
        }
        if (!userId) throw new Error(error?.message ?? 'createUser');
        const { error: ie } = await admin.from('profiles').upsert({ id: userId, login_id: loginId, role: lawyer ? 'lawyer' : 'staff', firm: '대륜', active: true, source: SOURCE, synced_at: now, ...fields }, { onConflict: 'id' });
        if (ie) throw ie;
        result.added++;
      } else {
        const patch: Record<string, unknown> = { source: SOURCE, synced_at: now };
        for (const [k, v] of Object.entries(fields)) if (v !== null && v !== (prof as Record<string, unknown>)[k]) patch[k] = v;
        if (prof.role === 'lawyer' || prof.role === 'staff') {
          const want = lawyer ? 'lawyer' : 'staff';
          if (want !== prof.role) patch.role = want;
        }
        if (!prof.active && prof.source === SOURCE) { patch.active = true; result.reactivated++; }
        const changed = Object.keys(patch).length > 2;
        const { error: ue } = await admin.from('profiles').update(patch).eq('id', prof.id);
        if (ue) throw ue;
        if (changed) result.updated++;
      }
    } catch (e) {
      result.errors.push(`${loginId}: ${String((e as Error).message ?? e).slice(0, 80)}`);
    }
  }

  // 5) 대륜탑에서 사라진 사람 — 동기화로 들어온 계정만 사용 중지
  for (const p of profiles ?? []) {
    if (p.source !== SOURCE || !p.active || byId.has(p.login_id)) continue;
    if (p.role === 'admin') { result.skipped++; continue; }
    const { error } = await admin.from('profiles').update({ active: false, synced_at: now }).eq('id', p.id);
    if (error) result.errors.push(`${p.login_id}: ${error.message.slice(0, 80)}`);
    else result.deactivated++;
  }

  console.log('[daeryuntop-sync]', caller, JSON.stringify({ total: byId.size, ...result, errors: result.errors.length }));
  return reply({ ok: true, total: byId.size, ...result, at: now });
});
