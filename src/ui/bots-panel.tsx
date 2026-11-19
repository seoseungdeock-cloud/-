// 백오피스 '봇': 바깥 시스템이 대화방에 글을 남기는 통로 — 봇 만들기(토큰 한 번 보여 줌), 방 넣기·빼기, 중지, 토큰 다시 만들기
import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { supabase } from '@/core/supabase';
import { Badge, Button, Card, Chip, Chips, Input, Notice, Sub, T } from '@/ui/kit';
import { family, radius, space, useColors } from '@/ui/theme';
import { useApp } from '@/ui/use-app';

type Bot = { id: string; name: string; description?: string; active: boolean; lastUsedAt?: string; rooms: string[] };

async function loadBots(): Promise<Bot[]> {
  if (!supabase) return [];
  const [b, r] = await Promise.all([supabase.from('bots').select('id, name, description, active, last_used_at').order('created_at'), supabase.from('bot_rooms').select('bot_id, room_id')]);
  const rooms = new Map<string, string[]>();
  for (const x of r.data ?? []) rooms.set(x.bot_id, [...(rooms.get(x.bot_id) ?? []), x.room_id]);
  return (b.data ?? []).map((x) => ({ id: x.id, name: x.name, description: x.description ?? undefined, active: x.active, lastUsedAt: x.last_used_at ?? undefined, rooms: rooms.get(x.id) ?? [] }));
}

export function BotsSection({ report }: { report: (r: { ok: boolean; reason?: string }, okText: string) => void }) {
  const c = useColors();
  const s = useApp();
  const [bots, setBots] = useState<Bot[]>([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [token, setToken] = useState<{ name: string; token: string }>();
  const [roomQ, setRoomQ] = useState<Record<string, string>>({});
  const reload = () => void loadBots().then(setBots);
  useEffect(reload, []);
  const apiBase = supabase ? `${(supabase as unknown as { supabaseUrl: string }).supabaseUrl}/functions/v1/bot-send` : 'https://<서버>/functions/v1/bot-send';
  const create = async () => {
    if (!supabase) return report({ ok: false, reason: '서버에 연결된 상태에서만 봇을 만들 수 있습니다.' }, '');
    const { data, error } = await supabase.rpc('create_bot', { p_name: name, p_description: desc || null });
    if (error) return report({ ok: false, reason: error.message }, '');
    const row = Array.isArray(data) ? data[0] : data;
    setToken({ name, token: row.token });
    setName(''); setDesc('');
    report({ ok: true }, `봇 「${name}」을 만들었습니다. 토큰은 지금 한 번만 보입니다.`);
    reload();
  };
  const setRoom = async (bot: Bot, roomId: string, on: boolean) => {
    if (!supabase) return;
    const { error } = on ? await supabase.from('bot_rooms').insert({ bot_id: bot.id, room_id: roomId }) : await supabase.from('bot_rooms').delete().eq('bot_id', bot.id).eq('room_id', roomId);
    report({ ok: !error, reason: error?.message }, on ? '방에 넣었습니다.' : '방에서 뺐습니다.');
    reload();
  };
  const toggle = async (bot: Bot) => {
    if (!supabase) return;
    const { error } = await supabase.from('bots').update({ active: !bot.active }).eq('id', bot.id);
    report({ ok: !error, reason: error?.message }, bot.active ? '봇을 중지했습니다.' : '봇을 다시 켰습니다.');
    reload();
  };
  const rotate = async (bot: Bot) => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('rotate_bot_token', { p_bot: bot.id });
    if (error) return report({ ok: false, reason: error.message }, '');
    setToken({ name: bot.name, token: String(data) });
    report({ ok: true }, '새 토큰을 만들었습니다. 옛 토큰은 바로 쓸 수 없습니다.');
  };
  const copy = (text: string) => { if (Platform.OS === 'web') void navigator.clipboard?.writeText(text); };
  return (
    <View style={{ marginTop: space.md }}>
      <Card>
        <T bold>봇 만들기</T>
        <Sub>대륜탑·SKYZAI·사내 스크립트가 대화방에 알림을 남기는 통로입니다. 봇마다 토큰을 발급하고, 글을 쓸 방을 정해 줍니다.</Sub>
        <View style={{ height: space.sm }} />
        <Input placeholder="봇 이름 (예: 대륜탑 알림)" value={name} onChangeText={setName} />
        <Input placeholder="설명 (선택)" value={desc} onChangeText={setDesc} />
        <Button label="만들기" disabled={!name.trim()} onPress={() => void create()} />
      </Card>
      {token ? (
        <Card>
          <T bold>「{token.name}」 토큰 — 지금만 보입니다</T>
          <Sub>잃어버리면 「토큰 다시 만들기」로 새로 받아야 합니다. 안전한 곳에 옮겨 두세요.</Sub>
          <View style={{ backgroundColor: c.bg, borderRadius: radius.sm, padding: space.md, marginVertical: space.sm }}>
            <Text selectable style={{ fontFamily: Platform.OS === 'web' ? 'ui-monospace, Menlo, monospace' : undefined, fontSize: 13, color: c.text }}>{token.token}</Text>
          </View>
          <Sub>보내는 법 (예시)</Sub>
          <View style={{ backgroundColor: c.bg, borderRadius: radius.sm, padding: space.md, marginTop: 6 }}>
            <Text selectable style={{ fontFamily: Platform.OS === 'web' ? 'ui-monospace, Menlo, monospace' : undefined, fontSize: 12, color: c.sub, lineHeight: 18 }}>
              {`curl -X POST ${apiBase} \\\n  -H "Authorization: Bearer ${token.token}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"room_id":"<방 id>","title":"기일 변경","text":"11/19 10:00 → 11/26 14:00"}'`}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
            {Platform.OS === 'web' ? <Button small kind="soft" label="토큰 복사" onPress={() => copy(token.token)} /> : null}
            <Button small kind="plain" label="닫기" onPress={() => setToken(undefined)} />
          </View>
        </Card>
      ) : null}
      {!supabase ? <Notice text="목업 모드에서는 봇을 만들 수 없습니다. 서버에 연결된 상태에서 쓰세요." /> : null}
      <Sub>봇 {bots.length}개</Sub>
      <View style={{ height: space.sm }} />
      {bots.map((b) => {
        const q = roomQ[b.id] ?? '';
        const candidates = q.trim() ? s.rooms.filter((r) => !b.rooms.includes(r.id) && r.title.includes(q.trim())).slice(0, 6) : [];
        return (
          <Card key={b.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <T bold>🤖 {b.name}</T>
                <Sub>{[b.description, b.lastUsedAt ? `마지막 사용 ${new Date(b.lastUsedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : '아직 사용 안 함'].filter(Boolean).join(' · ')}</Sub>
              </View>
              {b.active ? <Badge label="사용 중" tone="secure" /> : <Badge label="중지" tone="plain" />}
            </View>
            <Sub>글을 쓸 수 있는 방 {b.rooms.length}</Sub>
            <View style={{ height: 4 }} />
            <Chips>
              {b.rooms.map((rid) => { const r = s.rooms.find((x) => x.id === rid); return <Chip key={rid} label={`${r?.title ?? rid.slice(0, 8)} ×`} active onPress={() => void setRoom(b, rid, false)} />; })}
            </Chips>
            <Input placeholder="방 이름으로 찾아 넣기" value={q} onChangeText={(v) => setRoomQ((m) => ({ ...m, [b.id]: v }))} />
            {candidates.length ? <Chips>{candidates.map((r) => <Chip key={r.id} label={`+ ${r.title}`} onPress={() => { void setRoom(b, r.id, true); setRoomQ((m) => ({ ...m, [b.id]: '' })); }} />)}</Chips> : null}
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xs }}>
              <Button small kind="plain" label={b.active ? '중지' : '다시 켜기'} onPress={() => void toggle(b)} />
              <Button small kind="plain" label="토큰 다시 만들기" onPress={() => void rotate(b)} />
            </View>
            <Text style={{ ...family.regular, fontSize: 11, color: c.faint, marginTop: space.xs }} selectable>방 id: {b.rooms.map((rid) => rid).join(', ') || '-'}</Text>
          </Card>
        );
      })}
    </View>
  );
}
