// 백오피스 '감사': 누가 무엇을 했는지 기록 보기, 방 대화 CSV 내보내기 (관리자어드민)
import { useEffect, useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { supabase } from '@/core/supabase';
import { Badge, Button, Card, Chip, Chips, Empty, Input, Notice, Sub, T } from '@/ui/kit';
import { family, radius, space, useColors } from '@/ui/theme';

type Entry = { id: number; at: string; actorName?: string; action: string; targetKind?: string; targetId?: string; roomTitle?: string; detail: Record<string, unknown> };
type AdminRoom = { id: string; title: string; kind: string; memberCount: number; lastAt?: string };

const ACTION_LABEL: Record<string, string> = {
  'message.send': '메시지 보냄', 'message.recall': '메시지 회수', 'room.join': '방 입장', 'room.leave': '방 퇴장', 'room.create': '방 만듦', 'room.rename': '방 이름 변경',
  'post.create': '글 작성', 'post.delete': '글 삭제', 'account.enable': '계정 재개', 'account.disable': '계정 중지', 'account.role': '역할 변경', login: '로그인',
  'bot.create': '봇 발급', 'bot.enable': '봇 재개', 'bot.disable': '봇 중지', 'bot.rotate': '봇 토큰 재발급', 'export.messages': '대화 내보내기',
  'auth.login': '로그인', 'file.download': '파일 열람·내려받기', 'file.upload': '파일 올림', 'file.move': '파일 이름·폴더 변경', 'file.trash': '파일 휴지통', 'file.restore': '파일 복원', 'file.purge': '파일 영구 삭제',
  'file.link_create': '외부 링크 만듦', 'file.link_open': '외부 링크로 열람',
  'events.create': '일정 만듦', 'events.update': '일정 고침', 'events.delete': '일정 지움', 'tasks.create': '할 일 만듦', 'tasks.update': '할 일 고침', 'tasks.done': '할 일 완료', 'tasks.reopen': '할 일 되돌림', 'tasks.delete': '할 일 지움',
  'shared_notes.create': '노트 만듦', 'shared_notes.update': '노트 고침', 'shared_notes.delete': '노트 지움', 'contacts.create': '연락처 만듦', 'contacts.update': '연락처 고침', 'contacts.delete': '연락처 지움',
};
const FILTERS: [string, string][] = [['', '전체'], ['message', '메시지'], ['room', '방'], ['post', '게시판'], ['account', '계정'], ['login', '로그인'], ['bot', '봇'], ['export', '내보내기']];

/** CSV 글자 처리 (쉼표·따옴표·줄바꿈) */
export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(rows: unknown[][]): string {
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}
function download(name: string, text: string) {
  if (Platform.OS !== 'web') return;
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const fmt = (iso: string) => new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export function AuditSection({ report }: { report: (r: { ok: boolean; reason?: string }, okText: string) => void }) {
  const c = useColors();
  const [filter, setFilter] = useState('');
  // 서버가 없으면(목업) 빈 목록으로 시작
  const [entries, setEntries] = useState<Entry[] | undefined>(supabase ? undefined : []);
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [roomQ, setRoomQ] = useState('');
  const [room, setRoom] = useState<AdminRoom>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => {
    if (!supabase) return;
    void supabase.rpc('audit_recent', { p_limit: 300, p_action: filter || null }).then(({ data, error }) => {
      if (error) return report({ ok: false, reason: error.message }, '');
      setEntries((data ?? []).map((r: Record<string, any>) => ({ id: r.id, at: r.at, actorName: r.actor_name ?? undefined, action: r.action, targetKind: r.target_kind ?? undefined, targetId: r.target_id ?? undefined, roomTitle: r.room_title ?? undefined, detail: r.detail ?? {} })));
    });
  };
  useEffect(load, [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadRooms = () => {
    if (!supabase) return;
    void supabase.rpc('admin_rooms').then(({ data }) => setRooms((data ?? []).map((r: Record<string, any>) => ({ id: r.id, title: r.title, kind: r.kind, memberCount: r.member_count, lastAt: r.last_at ?? undefined }))));
  };
  useEffect(loadRooms, []);
  const candidates = useMemo(() => (roomQ.trim() ? rooms.filter((r) => r.title.includes(roomQ.trim())).slice(0, 8) : []), [rooms, roomQ]);
  const exportCsv = async () => {
    if (!supabase || !room) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('export_room_messages', { p_room: room.id, p_from: from ? `${from}T00:00:00+09:00` : null, p_to: to ? `${to}T23:59:59+09:00` : null });
    setBusy(false);
    if (error) return report({ ok: false, reason: error.message }, '');
    const rows: unknown[][] = [['시각', '보낸 사람', '종류', '내용', '첨부 수', '회수'], ...(data ?? []).map((m: Record<string, any>) => [fmt(m.at), m.sender, m.kind, m.text, m.attachments, m.recalled ? 'Y' : ''])];
    download(`skynet-${room.title.replace(/[\\/:*?"<>|]/g, '_')}-${from || '처음'}~${to || '지금'}.csv`, toCsv(rows));
    report({ ok: true }, `「${room.title}」 대화 ${(data ?? []).length}건을 내려받았습니다. (이 내보내기도 감사 기록에 남습니다)`);
    load();
  };
  const exportAudit = () => {
    if (!entries?.length) return;
    download(`skynet-audit-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([['시각', '사람', '행위', '대상', '방', '상세'], ...entries.map((e) => [fmt(e.at), e.actorName ?? '', ACTION_LABEL[e.action] ?? e.action, `${e.targetKind ?? ''} ${e.targetId ?? ''}`.trim(), e.roomTitle ?? '', JSON.stringify(e.detail)])]));
  };
  const detailText = (e: Entry) => {
    const d = e.detail as Record<string, any>;
    switch (e.action) {
      case 'message.send': return `${d.sender_kind === 'bot' ? `봇 ${d.bot ?? ''} · ` : ''}${d.length ?? 0}자${d.attachments ? ` · 첨부 ${d.attachments}` : ''}`;
      case 'message.recall': return `보낸 뒤 ${Math.round((d.age_sec ?? 0) / 60)}분`;
      case 'room.rename': return `${d.from} → ${d.to}`;
      case 'room.create': return `${d.kind} · ${d.title}`;
      case 'post.create': case 'post.delete': return `${d.board} · ${d.title}`;
      case 'account.role': return `${d.from} → ${d.to}`;
      case 'account.enable': case 'account.disable': return d.login_id ?? '';
      case 'export.messages': return `${d.from ? String(d.from).slice(0, 10) : '처음'} ~ ${d.to ? String(d.to).slice(0, 10) : '지금'}`;
      case 'auth.login': return String(d.login_id ?? '');
      case 'file.download': return `${d.source === 'drive' ? '파일함' : d.source === 'room' ? '대화 첨부' : '게시판 첨부'} · ${d.name ?? ''}`;
      case 'file.link_create': return `${d.name ?? ''} · ${d.access === 'firm' ? '구성원만' : '누구나'} · ${d.permission === 'preview' ? '보기만' : '내려받기'}${d.expires_at ? ` · ${String(d.expires_at).slice(0, 10)}까지` : ''}${d.password ? ' · 비밀번호' : ''}`;
      case 'file.link_open': return `${d.name ?? ''} (바깥에서 링크로)`;
      default: return d.name ?? '';
    }
  };
  return (
    <View style={{ marginTop: space.md }}>
      <Card>
        <T bold>대화 내보내기</T>
        <Sub>방 하나의 대화를 기간으로 잘라 CSV 로 내려받습니다. 회수된 메시지는 「(회수됨)」으로 표시되고, 내보낸 사실도 감사 기록에 남습니다.</Sub>
        <View style={{ height: space.sm }} />
        {room ? (
          <Chips><Chip label={`${room.title} · ${room.memberCount}명 ×`} active onPress={() => setRoom(undefined)} /></Chips>
        ) : (
          <>
            <Input placeholder="방 이름으로 찾기" value={roomQ} onChangeText={setRoomQ} />
            {candidates.length ? <Chips>{candidates.map((r) => <Chip key={r.id} label={`${r.title} · ${r.memberCount}명`} onPress={() => { setRoom(r); setRoomQ(''); }} />)}</Chips> : null}
          </>
        )}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}><Input placeholder="시작일 2026-01-01 (비우면 처음부터)" value={from} onChangeText={setFrom} autoCapitalize="none" /></View>
          <View style={{ flex: 1 }}><Input placeholder="종료일 (비우면 지금까지)" value={to} onChangeText={setTo} autoCapitalize="none" /></View>
        </View>
        <Button label={busy ? '내려받는 중…' : 'CSV 내려받기'} disabled={!room || busy || Platform.OS !== 'web'} onPress={() => void exportCsv()} />
        {Platform.OS !== 'web' ? <Sub>내려받기는 PC 웹에서 됩니다.</Sub> : null}
      </Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.md, marginBottom: space.sm }}>
        <T bold>감사 기록</T>
        <View style={{ marginLeft: 'auto' }}><Button small kind="soft" label="CSV" disabled={!entries?.length || Platform.OS !== 'web'} onPress={exportAudit} /></View>
      </View>
      <Chips>{FILTERS.map(([k, l]) => <Chip key={k} label={l} active={filter === k} onPress={() => setFilter(k)} />)}</Chips>
      {!supabase ? <Notice text="감사 기록은 서버에 연결된 상태에서 보입니다." /> : null}
      {entries === undefined ? <Sub>불러오는 중…</Sub> : entries.length ? entries.map((e) => (
        <View key={e.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <Text style={{ ...family.regular, fontSize: 12, color: c.faint, width: 118 }}>{fmt(e.at).slice(5, 19)}</Text>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={{ ...family.semibold, fontSize: 13.5, color: c.text }}>{e.actorName ?? '(시스템)'}</Text>
              <Badge label={ACTION_LABEL[e.action] ?? e.action} tone={/recall|disable|delete|export|purge|link_open/.test(e.action) ? 'warn' : 'plain'} />
              {e.roomTitle ? <Text style={{ ...family.regular, fontSize: 12.5, color: c.sub }}>{e.roomTitle}</Text> : null}
            </View>
            {detailText(e) ? <Text style={{ ...family.regular, fontSize: 12.5, color: c.sub }}>{detailText(e)}</Text> : null}
          </View>
        </View>
      )) : <Empty text="기록이 없습니다." />}
      <View style={{ height: space.lg, borderRadius: radius.sm }} />
    </View>
  );
}
