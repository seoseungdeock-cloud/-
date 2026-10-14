// 어드민 계정 관리 서버 함수: 계정 만들기, 비밀번호 초기화.
// 관리자 키(SUPABASE_SERVICE_ROLE_KEY)는 Supabase가 함수 안에만 넣어 주며 앱에는 나가지 않습니다.
import { createClient } from 'npm:@supabase/supabase-js@2';

const LOGIN_DOMAIN = 'rightnow.local';
const ROLES = ['client', 'lawyer', 'staff', 'admin'];
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Body =
  | { action: 'create'; loginId: string; password: string; nickname: string; role: string; firm?: string; officeId?: string }
  | { action: 'reset'; userId: string; password: string };

const reply = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (reason: string, status = 400) => reply(status, { ok: false, reason });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // 부른 사람 확인
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  const { data: who } = await admin.auth.getUser(jwt);
  if (!who.user) return fail('다시 로그인해 주세요.', 401);
  const { data: me } = await admin.from('profiles').select('role, super_admin, active').eq('id', who.user.id).single();
  if (!me || !me.active || me.role !== 'admin') return fail('어드민만 계정을 관리할 수 있습니다.', 403);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return fail('요청을 읽을 수 없습니다.');
  }

  if (body.action === 'create') {
    const loginId = body.loginId?.trim().toLowerCase() ?? '';
    if (!/^[a-z0-9._-]{3,30}$/.test(loginId)) return fail('아이디는 영문·숫자 3~30자로 정해 주세요.');
    if ((body.password ?? '').length < 8) return fail('비밀번호는 8자 이상이어야 합니다.');
    if (!body.nickname?.trim()) return fail('이름을 입력해 주세요.');
    if (!ROLES.includes(body.role)) return fail('역할을 골라 주세요.');
    const { data: made, error } = await admin.auth.admin.createUser({
      email: `${loginId}@${LOGIN_DOMAIN}`,
      password: body.password,
      email_confirm: true,
    });
    if (error || !made.user) return fail(/already/i.test(error?.message ?? '') ? '이미 쓰는 아이디입니다.' : '계정을 만들지 못했습니다.');
    const { error: pe } = await admin.from('profiles').insert({
      id: made.user.id,
      login_id: loginId,
      nickname: body.nickname.trim(),
      role: body.role,
      firm: body.role === 'client' ? null : body.firm ?? null,
      office_id: body.officeId ?? null,
    });
    if (pe) {
      await admin.auth.admin.deleteUser(made.user.id);
      return fail('계정을 만들지 못했습니다.');
    }
    return reply(200, { ok: true, userId: made.user.id });
  }

  if (body.action === 'reset') {
    if ((body.password ?? '').length < 8) return fail('비밀번호는 8자 이상이어야 합니다.');
    const { data: target } = await admin.from('profiles').select('role, super_admin').eq('id', body.userId).single();
    if (!target) return fail('계정을 찾을 수 없습니다.');
    if (target.role === 'admin' && target.super_admin && !me.super_admin) return fail('관리자어드민 계정은 관리자어드민만 바꿀 수 있습니다.', 403);
    const { error } = await admin.auth.admin.updateUserById(body.userId, { password: body.password });
    if (error) return fail('비밀번호를 바꾸지 못했습니다.');
    return reply(200, { ok: true });
  }

  return fail('알 수 없는 요청입니다.');
});
