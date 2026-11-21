// 봇 메시지 보내기 (2026-11-22) — 바깥 시스템이 스카이넷 대화방에 글을 남기는 통로. 네이버웍스 Bot API 의 「메시지 보내기(채널 대상)」에 해당.
//
// 인증: Authorization: Bearer <봇 토큰>  (백오피스 → 봇 관리에서 발급. 토큰은 해시로만 저장)
//
// POST { room_id, text }             → 그 방에 메시지. 봇이 그 방에 넣어져 있어야 함 (bot_rooms).
// POST { room_id, title, text }      → 제목이 있으면 첫 줄에 굵게 붙임.
// POST { login_id | user_id, text }  → 그 사람과 봇의 1:1 방으로 (없으면 만듦). 네이버웍스 「메시지 보내기(사용자 대상)」.
// POST { ..., buttons: [{label, url}] } → 글 아래 링크 버튼 최대 3개 (네이버웍스 button template 의 링크 버튼만).
// POST { action: 'rooms' }           → 이 봇이 글을 쓸 수 있는 방 목록 { rooms: [{ id, title }] }
//
// 응답 { ok: true, message_id } / { ok: false, code, reason }
// 메시지는 sender_kind='bot', bot_name=봇 이름 으로 들어가며, 방 구성원에게 푸시가 평소처럼 나간다.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (code: string, reason: string, status = 400) => reply({ ok: false, code, reason }, status);
const MAX_TEXT = 4000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('method', 'POST only', 405);
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token || !token.startsWith('skb_')) return fail('auth', '봇 토큰이 필요합니다.', 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const { data: bots, error: be } = await admin.rpc('bot_by_token', { p_token: token });
  const bot = Array.isArray(bots) ? bots[0] : bots;
  if (be || !bot) return fail('auth', '봇 토큰이 맞지 않습니다.', 401);
  if (!bot.active) return fail('inactive', '사용이 중지된 봇입니다.', 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return fail('body', 'JSON 본문이 필요합니다.'); }

  const { data: allowed } = await admin.from('bot_rooms').select('room_id, rooms(id, title)').eq('bot_id', bot.id);
  const rooms = (allowed ?? []).map((r: Record<string, any>) => ({ id: r.room_id as string, title: (r.rooms?.title as string) ?? '' }));

  if (body.action === 'rooms') return reply({ ok: true, bot: bot.name, rooms });

  let roomId = typeof body.room_id === 'string' ? body.room_id : undefined;
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  // 1:1 — 받는 사람을 사번(login_id)이나 계정 id 로 지정
  if (!roomId && (typeof body.login_id === 'string' || typeof body.user_id === 'string')) {
    const q = admin.from('profiles').select('id, active, role');
    const { data: who } = typeof body.user_id === 'string' ? await q.eq('id', body.user_id).maybeSingle() : await q.eq('login_id', String(body.login_id).trim().toLowerCase()).maybeSingle();
    if (!who || !who.active) return fail('user', '받는 사람을 찾을 수 없습니다.', 404);
    if (who.role === 'client') return fail('user', '의뢰인에게는 봇 메시지를 보낼 수 없습니다.', 403);
    const { data: rid, error: re } = await admin.rpc('bot_direct_room', { p_bot: bot.id, p_user: who.id });
    if (re || !rid) return fail('db', re?.message ?? 'bot_direct_room', 500);
    roomId = rid as string;
  } else if (roomId && !rooms.some((r) => r.id === roomId)) {
    return fail('room', '이 봇이 글을 쓸 수 없는 방입니다. 백오피스에서 봇을 그 방에 넣어 주세요.', 403);
  }
  if (!roomId) return fail('room', 'room_id 또는 login_id 가 필요합니다.');
  if (!text && !title) return fail('text', 'text 가 필요합니다.');
  const full = (title ? `【${title}】\n` : '') + text;
  if (full.length > MAX_TEXT) return fail('text', `글은 ${MAX_TEXT}자까지 보낼 수 있습니다.`);
  // 링크 버튼: https 만, 최대 3개, 이름 30자
  let buttons: { label: string; url: string }[] | null = null;
  if (Array.isArray(body.buttons)) {
    buttons = (body.buttons as unknown[]).slice(0, 3).map((b) => {
      const o = (b ?? {}) as Record<string, unknown>;
      return { label: String(o.label ?? '').trim().slice(0, 30), url: String(o.url ?? '').trim() };
    }).filter((b) => b.label && /^https:\/\//i.test(b.url) && b.url.length <= 1000);
    if (!buttons.length) buttons = null;
  }

  const { data: msg, error } = await admin.from('messages').insert({ room_id: roomId, sender_kind: 'bot', kind: 'bot', text: full, bot_name: bot.name, buttons }).select('id').single();
  if (error) return fail('db', error.message, 500);
  await admin.from('bots').update({ last_used_at: new Date().toISOString() }).eq('id', bot.id);
  console.log('[bot-send]', bot.name, roomId, full.length, buttons?.length ?? 0);
  return reply({ ok: true, message_id: msg.id, room_id: roomId });
});
