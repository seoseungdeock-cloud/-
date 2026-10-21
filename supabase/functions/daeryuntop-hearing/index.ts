// 대륜탑 → 라잇나우 기일 연동 (대륜탑 쪽 준비가 끝나면 배포합니다).
// 대륜탑 기일관리에서 기일이 생기거나 바뀌거나 지워지면 이 주소로 보냅니다. 헤더 x-daeryuntop-secret이 함수 비밀값과 같아야 합니다.
// 보내는 모양 (한 번에 여러 건 가능, 의뢰인 이름·연락처는 보내지 않습니다):
//   { "hearings": [{
//       "id": "대륜탑 기일 번호", "caseNo": "2026가단1234" (또는 "caseRef": "대륜탑 사건 고유번호"),
//       "official": true (공식 일정 ★, 개인 일정 ◇ 이면 false), "party": "우리측" | "상대측" | "확인용",
//       "name": "변론기일", "date": "2026-11-02", "time": "10:30" (없으면 생략 또는 "00:00"),
//       "court": "부산지방법원", "place": "351호 법정",
//       "flags": ["불변", "엄수", "추정", "변경", "재개", "부진행", "완료", "기일소거"] 중 체크된 것,
//       "deleted": false (대륜탑에서 기일을 지웠으면 true) }] }
// 처리 규칙은 supabase/migrations/20261021000000_daeryuntop_hearings.sql 의 ingest_daeryuntop_hearing 에 있습니다.
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const secret = Deno.env.get('DAERYUNTOP_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-daeryuntop-secret') !== secret) return new Response('forbidden', { status: 403 });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  let items: Record<string, unknown>[];
  try {
    const body = await req.json();
    items = Array.isArray(body?.hearings) ? body.hearings : [body];
  } catch {
    return new Response('bad json', { status: 400 });
  }
  if (items.length > 500) return new Response('too many', { status: 413 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const results = [];
  for (const h of items) {
    const { data, error } = await db.rpc('ingest_daeryuntop_hearing', { p: h });
    results.push({ id: h?.id ?? null, ok: !error && !String(data).startsWith('skip:'), result: error ? error.message : data });
  }
  return Response.json({ results });
});
