// 파일함 외부 링크 (2026-11-27) — 네이버웍스 Drive 「링크 공유」 대응.
//
// 올린 사람이 앱에서 만든 링크(토큰)로 바깥 사람이 파일을 받는 통로입니다. 로그인 없이 열 수 있지만,
// 링크마다 만료·비밀번호·접근 범위(anyone/firm)가 있고 열 때마다 감사 기록이 남습니다.
//
// GET  /drive-link?t=<토큰>                 → 비밀번호가 없으면 바로 파일로(302), 있으면 비밀번호 입력 페이지
// POST /drive-link  form: t, password       → 맞으면 파일로(302)
// 'firm' 링크는 Authorization: Bearer <로그인 토큰> 이 있어야 하며(앱 안에서 열 때), 바깥에서 열면 로그인 안내.
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;background:#F7F8FA;color:#191F28;display:flex;min-height:100vh;align-items:center;justify-content:center}
main{background:#fff;border-radius:16px;padding:32px 28px;width:min(400px,92vw);box-shadow:0 8px 32px rgba(15,23,42,.08)}h1{font-size:18px;margin:0 0 6px}p{color:#6B7684;font-size:14px;margin:0 0 16px;line-height:1.5}
input{width:100%;box-sizing:border-box;border:1px solid #E5E8EB;border-radius:12px;padding:12px 14px;font-size:16px;margin-bottom:12px}button{width:100%;border:0;border-radius:12px;background:#2E5BFF;color:#fff;font-size:15px;font-weight:600;padding:13px;cursor:pointer}
.err{color:#E8590C;font-size:13px;margin:-6px 0 12px}.brand{font-weight:800;letter-spacing:-.5px;margin-bottom:18px}.brand b{color:#2E5BFF}</style></head>
<body><main><div class="brand">SKY<b>NET</b></div>${body}</main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
const askPassword = (token: string, name: string, err?: string) =>
  page('파일 받기', `<h1>${esc(name || '공유된 파일')}</h1><p>이 파일은 비밀번호로 보호되어 있습니다.</p>
<form method="post"><input type="hidden" name="t" value="${esc(token)}"><input type="password" name="password" placeholder="비밀번호" autofocus required>${err ? `<div class="err">${esc(err)}</div>` : ''}<button>받기</button></form>`);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let token = url.searchParams.get('t') ?? '';
  let password: string | null = null;
  if (req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    token = String(form?.get('t') ?? token);
    password = form?.get('password') ? String(form.get('password')) : null;
  } else if (req.method !== 'GET') return new Response('GET or POST', { status: 405 });
  if (!token.startsWith('skl_')) return page('없는 링크', '<h1>없는 링크입니다</h1><p>주소를 다시 확인해 주세요.</p>', 404);
  const sb = admin();
  // 앱 안에서 열었으면(로그인 토큰) 구성원 전용 링크도 통과
  let firmUser: string | null = null;
  const auth = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (auth) {
    const { data } = await sb.auth.getUser(auth);
    firmUser = data.user?.id ?? null;
  }
  // 비밀번호가 필요한 링크인지 먼저 (토큰 해시로 조회)
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))).map((b) => b.toString(16).padStart(2, '0')).join('');
  const { data: link } = await sb.from('drive_links').select('id, password_hash, expires_at, revoked_at, access, drive_files(name)').eq('token_hash', hash).maybeSingle();
  if (!link || link.revoked_at) return page('없는 링크', '<h1>없는 링크입니다</h1><p>링크가 지워졋거나 주소가 틀렸습니다.</p>', 404);
  if (link.expires_at && new Date(link.expires_at) < new Date()) return page('만료된 링크', '<h1>만료된 링크입니다</h1><p>보낸 사람에게 새 링크를 요청해 주세요.</p>', 410);
  if (link.access === 'firm' && !firmUser) return page('구성원 전용', '<h1>구성원만 열 수 있는 파일입니다</h1><p>SKYNET 앱에 로그인한 뒤 앱 안에서 링크를 열어 주세요.</p>', 403);
  const fileName = ((link as Record<string, any>).drive_files?.name as string) ?? '';
  if (link.password_hash && password === null) return askPassword(token, fileName);
  const { data: rows, error } = await sb.rpc('resolve_drive_link', { p_token: token, p_password: password, p_firm_user: firmUser });
  if (error) {
    if (/비밀번호/.test(error.message)) return askPassword(token, fileName, '비밀번호가 다릅니다.');
    return page('열 수 없는 링크', `<h1>열 수 없습니다</h1><p>${esc(error.message)}</p>`, 403);
  }
  const f = Array.isArray(rows) ? rows[0] : rows;
  if (!f) return page('없는 링크', '<h1>파일이 없습니다</h1>', 404);
  const { data: signed, error: se } = await sb.storage.from('drive').createSignedUrl(f.path, 300, f.permission === 'download' ? { download: f.name } : undefined);
  if (se || !signed) return page('오류', `<h1>파일을 준비하지 못했습니다</h1><p>${esc(se?.message ?? '')}</p>`, 500);
  return new Response(null, { status: 302, headers: { Location: signed.signedUrl, 'Cache-Control': 'no-store' } });
});
