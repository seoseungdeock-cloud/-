// 푸시 보내기 서버 함수 (폰·PC 브라우저).
// 1분마다(예약 작업) 또는 기일 알람이 생길 때 DB가 부릅니다. 부를 때 x-push-secret이 맞아야 합니다.
// 하는 일: 미리 알림(7일 전·전날·당일 아침) 쌓기 → 쌓인 푸시를 폰(Expo 푸시)과 PC·웹 브라우저(웹 푸시)로 보내기 → 지워진 주소 정리.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

type WebSub = { endpoint: string; keys: { p256dh: string; auth: string } };
type Item = { id: number; user_id: string; title: string; body: string; data: Record<string, unknown>; tokens: string[]; web: WebSub[] };

const vapidKey = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_PUBLIC = 'BJxZdUCxLWRBXYC1agdpladp4WLZPgd3vKCKJeJV28622GnLZdyKlYpbjJf00MSyZj-yrs6AzrS1HRKIxyvyJVI';
if (vapidKey) webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@rightnow.local', VAPID_PUBLIC, vapidKey);
type Ticket = { status: 'ok' | 'error'; message?: string; details?: { error?: string } };

Deno.serve(async (req) => {
  const secret = Deno.env.get('PUSH_CRON_SECRET');
  if (!secret || req.headers.get('x-push-secret') !== secret) return new Response('forbidden', { status: 403 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: queued, error: qe } = await db.rpc('enqueue_hearing_reminders');
  if (qe) console.error('reminders', qe.message);

  const { data, error } = await db.rpc('claim_push_batch', { p_limit: 500 });
  if (error) return new Response(error.message, { status: 500 });
  const items = (data ?? []) as Item[];

  // PC·웹 브라우저: 받으면 그 건은 보낸 것. 없어진 브라우저 주소는 지웁니다.
  const webOk = new Set<number>();
  const webGone: string[] = [];
  if (vapidKey) {
    await Promise.all(
      items.flatMap((i) =>
        (i.web ?? []).map(async (sub) => {
          try {
            await webpush.sendNotification(sub, JSON.stringify({ title: i.title, body: i.body, data: i.data }), { TTL: 86400, urgency: 'high' });
            webOk.add(i.id);
          } catch (e) {
            const code = (e as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) webGone.push(sub.endpoint);
          }
        }),
      ),
    );
  }
  if (webGone.length) await db.from('web_push_subs').delete().in('endpoint', webGone);

  // 폰도 브라우저도 없는 사람 것은 보낸 것으로 닫습니다 (앱을 열면 앱 안 알람 창으로 봄)
  const noDevice = items.filter((i) => !i.tokens.length && !(i.web ?? []).length).map((i) => i.id);
  if (noDevice.length) await db.rpc('finish_push', { p_ids: noDevice, p_error: 'no device' });

  const messages = items.flatMap((i) =>
    i.tokens.map((to) => ({
      id: i.id,
      msg: { to, title: i.title, body: i.body, data: i.data, sound: 'default', priority: 'high', channelId: i.data?.kind === 'message' ? 'messages' : 'hearings' },
    })),
  );
  const sent: number[] = [];
  const failed = new Map<number, string>();
  const gone = new Set<string>();
  for (let k = 0; k < messages.length; k += 100) {
    const chunk = messages.slice(k, k + 100);
    try {
      const res = await fetch(EXPO_PUSH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk.map((c) => c.msg)),
      });
      const tickets = ((await res.json())?.data ?? []) as Ticket[];
      chunk.forEach((c, n) => {
        const t = tickets[n];
        if (t?.status === 'ok') sent.push(c.id);
        else {
          if (t?.details?.error === 'DeviceNotRegistered') gone.add(c.msg.to);
          failed.set(c.id, t?.details?.error ?? t?.message ?? `HTTP ${res.status}`);
        }
      });
    } catch (e) {
      chunk.forEach((c) => failed.set(c.id, String(e)));
    }
  }
  // 폰이나 브라우저 하나라도 받았으면 보낸 것. 모두 실패한 것은 다음 차례에 다시 (세 번까지).
  const ok = [...new Set([...sent, ...webOk])];
  if (ok.length) await db.rpc('finish_push', { p_ids: ok });
  const deadOnly = items.filter((i) => i.tokens.length && !ok.includes(i.id) && i.tokens.every((t) => gone.has(t))).map((i) => i.id);
  if (deadOnly.length) await db.rpc('finish_push', { p_ids: deadOnly, p_error: 'DeviceNotRegistered' });
  if (gone.size) await db.from('push_tokens').delete().in('token', [...gone]);

  return Response.json({ reminders: queued ?? 0, claimed: items.length, sent: ok.length, web: webOk.size, failed: failed.size, removedTokens: gone.size + webGone.length });
});
