// 게시판 첨부 올리기 주소 (4단계).
// 앱이 직접 올리면 저장소에 올린 사람 기록이 남아 익명 글쓴이가 드러날 수 있어서,
// 이 함수가 글쓴이 자격을 확인한 뒤 관리자 키로 1회용 올리기 주소를 내줍니다 (올린 사람 기록 없음).
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'board-files';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const reply = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (reason: string, status = 400) => reply(status, { ok: false, reason });

type Body = { board: string; postId: string; files: { id: string; name: string }[] };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const auth = req.headers.get('Authorization') ?? '';
  // 글쓴이 계정으로 자격 확인 (게시판 볼 수 있는지, 이용 제한 중인지)
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: who } = await asUser.auth.getUser(auth.replace(/^Bearer /, ''));
  if (!who.user) return fail('다시 로그인해 주세요.', 401);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return fail('알 수 없는 요청입니다.');
  }
  const files = Array.isArray(body.files) ? body.files : [];
  if (!UUID.test(body.postId ?? '')) return fail('알 수 없는 요청입니다.');
  if (!files.length || files.length > 5) return fail('첨부는 5개까지 올릴 수 있습니다.');
  const { error: ge } = await asUser.rpc('board_upload_check', { p_board: body.board });
  if (ge) return fail(/[가-힣]/.test(ge.message) ? ge.message : '올릴 수 없습니다.', 403);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  // 이미 올라간 글에는 덧붙이지 못하게
  const { data: exists } = await admin.from('posts').select('id').eq('id', body.postId).maybeSingle();
  if (exists) return fail('이미 올라간 글입니다.');

  const out = [];
  for (const f of files) {
    // 저장소 경로에는 영문·숫자만 쓸 수 있어 '첨부 id + 확장자'로 둡니다 (화면의 파일 이름은 글에 따로 저장)
    const safeId = String(f.id ?? '').replace(/[^\w-]/g, '').slice(0, 40) || crypto.randomUUID();
    const ext = /\.[A-Za-z0-9]{1,8}$/.exec(String(f.name ?? ''))?.[0].toLowerCase() ?? '';
    const path = `${body.postId}/${safeId}${ext}`;
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error || !data) return fail('올리기 주소를 만들지 못했습니다.', 500);
    out.push({ id: f.id, path, token: data.token });
  }
  return reply(200, { ok: true, files: out });
});
