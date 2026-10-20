// 대륜탑 → 라잇나우 불변기간 연동 (대륜탑 쪽 준비가 끝나면 배포합니다).
// 대륜탑이 사건의 불변기간이 생기거나 바뀌거나 조치되면 이 주소로 보냅니다. 헤더 x-daeryuntop-secret이 함수 비밀값과 같아야 합니다.
// 보내는 모양 (한 번에 여러 건 가능):
//   { "deadlines": [{ "id": "대륜탑 불변기간 번호", "caseRef": "대륜탑 사건 번호", "label": "항소기간", "dueDate": "2026-11-02",
//                     "lawyerLoginId": "담당 변호사 앱 아이디(선택)", "handled": false, "cancelled": false }] }
// 사건은 앱의 cases.external_ref(대륜탑 사건 번호)로 찾습니다.
import { createClient } from 'npm:@supabase/supabase-js@2';

type In = { id?: string; caseRef?: string; label?: string; dueDate?: string; lawyerLoginId?: string; handled?: boolean; cancelled?: boolean };

Deno.serve(async (req) => {
  const secret = Deno.env.get('DAERYUNTOP_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-daeryuntop-secret') !== secret) return new Response('forbidden', { status: 403 });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  let items: In[];
  try {
    const body = await req.json();
    items = Array.isArray(body?.deadlines) ? body.deadlines : [body];
  } catch {
    return new Response('bad json', { status: 400 });
  }
  if (items.length > 500) return new Response('too many', { status: 413 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const results = [];
  for (const d of items) {
    if (!d.id || !d.caseRef || (!d.cancelled && (!d.label || !/^\d{4}-\d{2}-\d{2}$/.test(d.dueDate ?? '')))) {
      results.push({ id: d.id ?? null, ok: false, error: 'id, caseRef, label, dueDate(YYYY-MM-DD) required' });
      continue;
    }
    const { error } = await db.rpc('ingest_daeryuntop_deadline', {
      p_external_id: d.id, p_case_ref: d.caseRef, p_label: d.label ?? '', p_due: d.dueDate ?? '2000-01-01',
      p_lawyer_login: d.lawyerLoginId ?? null, p_handled: typeof d.handled === 'boolean' ? d.handled : null, p_cancelled: !!d.cancelled,
    });
    results.push({ id: d.id, ok: !error, ...(error ? { error: error.message } : {}) });
  }
  return Response.json({ results });
});
