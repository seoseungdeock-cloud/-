// 대륜탑 구성원 명단 동기화 (2026-11-19).
//
// 대륜탑(ERP) 데이터베이스의 구성원 표(admin_user)를 **읽기만** 해서 스카이넷 계정(auth.users + profiles)을 맞춥니다.
// 대륜탑에는 SELECT 한 번만 보내고 아무것도 쓰지 않습니다 — 연결 계정도 읽기 전용으로 만들어 두는 것을 권합니다.
//
//   · 대륜탑에 있는데 스카이넷에 없는 사번 → 계정을 만들어 둡니다 (비밀번호 없음. 로그인은 늘 대륜탑 인증을 거칩니다).
//   · 둘 다 있는 사번 → 이름·직위·부서·지점·전화·이메일을 대륜탑 값으로 맞춥니다. 역할은 변호사/직원만 직위에 따라 바꾸고, 어드민은 건드리지 않습니다.
//   · 전에 동기화로 들어왔는데 대륜탑에서 사라진(퇴사·삭제·미승인) 사번 → 사용 중지(active=false). 다시 나타나면 다시 켭니다.
//   · 손으로 만든 계정(의뢰인, 테스트 계정 등)은 건드리지 않습니다.
//   · 사람이 아닌 계정(대륜탑관리자·System·AICC 같은 시스템/봇 계정, 직위 없는 부서 계정)은 명단에서 뺍니다 — 이름·아이디 규칙 + DAERYUNTOP_SYNC_EXCLUDE.
//
// 부르는 쪽
//   · pg_cron → public.kick_daeryuntop_sync() → 이 함수 (헤더 x-sync-secret = Vault 'daeryuntop_sync_secret')
//   · 백오피스 「대륜탑 명단 동기화」 버튼 → 어드민 세션 토큰으로 호출 (profiles.role = 'admin' 확인)
//
// 비밀값(함수 설정에서만): SUPABASE_SERVICE_ROLE_KEY(자동), DAERYUNTOP_DB_URL (postgres://읽기전용계정:비밀번호@호스트:5432/디비), DAERYUNTOP_SYNC_SECRET,
//   DAERYUNTOP_ENC_KEY (대륜탑이 전화번호를 AES 로 암호화해 두는 키 — 있으면 전화번호를 풀어서 넣고, 없으면 전화번호는 비움),
//   DAERYUNTOP_SYNC_EXCLUDE (명단에서 뺄 사번, 쉼표 구분. 기본값 아래 EXCLUDE_IDS)
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
  admin_id: string; admin_name: string; position_code: string | null; position_name: string | null; department_name: string | null; name_is_code: boolean; branch_name: string | null;
  admin_tel: string | null; admin_email: string | null; created_at: string | null;
  duty: string | null; job: string | null; rank_order: number | null; dept_order: number | null;
};
/** 사람이 아닌 계정 — 대륜탑 관리자·시스템·봇·부서 공용 계정 (2026-11-19 명단 기준). 환경변수로 더할 수 있습니다. */
const EXCLUDE_IDS = new Set(['dr_admin', 'app_test', 'aicc', 'daeryuntalkai', 'daeryun', 'sys', 'jin', 'audit', 'meeting', 'manager12', 'manager13', ...(Deno.env.get('DAERYUNTOP_SYNC_EXCLUDE') ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)]);
const NOT_PERSON = /관리자|테스트|\btest\b|system|\bbot\b|^aicc$|ai$|^sys|\(hq\)|공용|회의실/i;
/**
 * 사람 계정인지. 다음은 사람이 아닙니다:
 *   · 제외 목록 사번 · 이름/아이디가 관리자·test·system·bot·AI 같음 · 직위 코드가 아예 없음(부서 공용 계정)
 *   · 이름이 부서·지점·직위 이름표(common_code)와 똑같음 — 「감사실」「회의실」「경영관리팀」처럼 부서명을 이름으로 쓴 공용 계정.
 *     (손영실 같은 사람 이름은 이름표와 같지 않아 그대로 사람)
 */
function isPerson(m: TopMember): boolean {
  const id = m.admin_id.trim().toLowerCase();
  if (EXCLUDE_IDS.has(id)) return false;
  if (NOT_PERSON.test(m.admin_name) || NOT_PERSON.test(id)) return false;
  if (!m.position_code?.trim()) return false;
  if (m.name_is_code) return false;
  if (m.department_name === '마스터') return false;
  return true;
}

/** AWS RDS 인증서 발급기관 묶음 — 런타임 기본 신뢰 목록에 없어 직접 받아 TLS 검증에 씁니다 (한 번 받아 두고 재사용). */
let rdsCa: string | undefined;
async function rdsCaBundle(): Promise<string | undefined> {
  if (rdsCa) return rdsCa;
  try {
    const res = await fetch('https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem', { signal: AbortSignal.timeout(10_000) });
    if (res.ok) rdsCa = await res.text();
  } catch (e) {
    console.warn('[daeryuntop-sync] rds ca bundle', String(e));
  }
  return rdsCa;
}

/** 대륜탑에서 재직 중(승인·미삭제) 구성원. SELECT 만. */
async function readDaeryuntop(): Promise<TopMember[]> {
  const url = Deno.env.get('DAERYUNTOP_DB_URL');
  if (!url) throw new Error('DAERYUNTOP_DB_URL 이 설정되지 않았습니다');
  const ca = await rdsCaBundle();
  const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 10, prepare: false, ssl: ca ? { ca } : 'prefer' });
  const encKey = Deno.env.get('DAERYUNTOP_ENC_KEY') ?? '';
  try {
    // 부서·직위·지점은 코드라서 common_code 에서 이름으로 바꿉니다 (대륜탑 화면과 같은 방식). 전화번호는 대륜탑이 AES 로 암호화해 두므로 키가 있을 때만 풉니다.
    const rows = await sql<TopMember[]>`
      select au.admin_id, au.admin_name, au.admin_email, au.created_at, au.position as position_code,
             pc.code_name as position_name, dc.code_name as department_name, bc.code_name as branch_name,
             pc.sort_num as rank_order, dc.sort_num as dept_order,
             exists (select 1 from common_code cc where cc.deleted_at is null and cc.code_name = au.admin_name) as name_is_code,
             -- 직책(75)·직군(73)은 admin_position 에 여러 줄로 있을 수 있어 이름을 이어 붙입니다
             (select string_agg(x.code_name, ', ' order by x.sort_num, x.code_name) from admin_position ap join common_code x on x.code = ap.code and x.deleted_at is null
               where ap.admin_id = au.admin_id and ap.parent_code = 75 and ap.deleted_at is null) as duty,
             (select string_agg(x.code_name, ', ' order by x.sort_num, x.code_name) from admin_position ap join common_code x on x.code = ap.code and x.deleted_at is null
               where ap.admin_id = au.admin_id and ap.parent_code = 73 and ap.deleted_at is null) as job,
             case when ${encKey} <> '' and au.admin_tel ~ '^[0-9a-fA-F]+$'
                  then convert_from(decrypt(decode(au.admin_tel, 'hex'), ${encKey}::bytea, 'aes'), 'utf8')
                  else null end as admin_tel
        from admin_user au
        left join common_code bc on bc.code = au.branch and bc.deleted_at is null
        left join common_code pc on au.position ~ '^[0-9]+$' and pc.code = au.position::int and pc.deleted_at is null
        left join common_code dc on au.department ~ '^[0-9]+$' and dc.code = au.department::int and dc.deleted_at is null
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
/** 임원 직급 이름표 (네이버웍스 Level.executive 에 해당). 환경변수 DAERYUNTOP_OFFICER_RANKS 로 바꿀 수 있음 */
const OFFICER_RANKS = new Set((Deno.env.get('DAERYUNTOP_OFFICER_RANKS') ?? '대표,부대표,의장,글로벌의장,한국경영대표,글로벌경영대표,최고총괄변호사').split(',').map((x) => x.trim()).filter(Boolean));
const isOfficer = (position: string | null) => !!position && OFFICER_RANKS.has(position.trim());
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
  let notPerson = 0;
  for (const m of members) {
    const id = m.admin_id.trim().toLowerCase();
    if (!ID_RE.test(id)) continue;
    if (!isPerson(m)) { notPerson++; continue; }
    byId.set(id, m);
  }

  // 3) 스카이넷 쪽 현재 상태
  const { data: profiles, error: pe } = await admin.from('profiles').select('id, login_id, nickname, role, title, dept, branch, phone, email, active, source, duty, job, rank_order, dept_order, officer');
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
      nickname, title: clean(m.position_name), dept: clean(m.department_name), branch: clean(m.branch_name),
      joined_at: m.created_at ? new Date(m.created_at).toISOString().slice(0, 10) : null,
    };
    // 연락처는 대륜탑이 기준 — 비어 있으면 비웁니다 (암호화된 채 들어온 값이 남지 않도록)
    const contact = {
      phone: clean(m.admin_tel, 30), email: clean(m.admin_email, 120),
      // 조직도용 — 직책·직군·표시 순서도 대륜탑이 기준이라 비면 비웁니다
      duty: clean(m.duty, 80), job: clean(m.job, 40), rank_order: m.rank_order ?? null, dept_order: m.dept_order ?? null,
      officer: isOfficer(m.position_name),
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
        const { error: ie } = await admin.from('profiles').upsert({ id: userId, login_id: loginId, role: lawyer ? 'lawyer' : 'staff', firm: '대륜', active: true, source: SOURCE, synced_at: now, ...fields, ...contact }, { onConflict: 'id' });
        if (ie) throw ie;
        result.added++;
      } else {
        const patch: Record<string, unknown> = { source: SOURCE, synced_at: now };
        for (const [k, v] of Object.entries(fields)) if (v !== null && v !== (prof as Record<string, unknown>)[k]) patch[k] = v;
        for (const [k, v] of Object.entries(contact)) if (v !== (prof as Record<string, unknown>)[k]) patch[k] = v;
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

  console.log('[daeryuntop-sync]', caller, JSON.stringify({ total: byId.size, notPerson, ...result, errors: result.errors.length }));
  return reply({ ok: true, total: byId.size, notPerson, ...result, at: now });
});
