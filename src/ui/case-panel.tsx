import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { limitLawyers, limitStatus, limitWhen } from '@/core/deadlines';
import { dueDate, periodLabel, suggestLimits, type LimitSuggestion } from '@/core/limit-rules';
import { demoUpdate } from '@/core/hearings';
import { actions } from '@/core/store';
import type { CaseStage, Room } from '@/core/types';
import { dDay, whenLabel } from '@/core/hearings';
import { DBadge, HearingList } from './hearing';
import { Icon } from './icons';
import { Badge, Button, Card, Chip, Chips, Input, Notice, Sub, T } from './kit';
import { family, space, useColors } from './theme';
import { useApp } from './use-app';

const STAGES: CaseStage[] = ['수임', '진행', '종결'];
const TYPES = [
  { key: 'progress', label: '진행' },
  { key: 'deadline', label: '기일' },
  { key: 'document', label: '서류' },
  { key: 'cost', label: '비용' },
  { key: 'limit', label: '불변기간' },
] as const;

/** 사건방 상단의 사건 자료. 대화를 하면서 같은 화면에서 봅니다. */
/** 사건방마다 펼침 상태를 기억 (앱을 켜 둔 동안). 처음에는 접힘. */
const folded = new Map<string, boolean>();

export function CasePanel({ room, canEdit }: { room: Room; canEdit: boolean }) {
  const ci = room.caseInfo!;
  const c = useColors();
  const [open, setOpen] = useState(() => folded.get(room.id) ?? false);
  const [type, setType] = useState<(typeof TYPES)[number]['key']>('progress');
  const [label, setLabel] = useState('');
  const [extra, setExtra] = useState('');
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const [error, setError] = useState('');
  const [lawyerId, setLawyerId] = useState<string>();
  const app = useApp();
  const lawyers = limitLawyers(room, {}, app.users);
  const add = () => {
    if (!label.trim()) return;
    if (type === 'limit') {
      const r = actions.addLimit(room.id, { label: label.trim(), due: extra.trim(), lawyerId });
      if (!r.ok) return setError(r.reason);
      setError('');
      setLabel('');
      setExtra('');
      setLawyerId(undefined);
      return;
    }
    const r = actions.addCaseEntry(room.id, { type, label: label.trim(), date: type === 'deadline' ? extra : undefined, time: time.trim() || undefined, place, amount: type === 'cost' ? Number(extra.replace(/,/g, '')) || 0 : undefined });
    if (!r.ok) return setError(r.reason);
    setError('');
    setLabel('');
    setExtra('');
    setTime('');
    setPlace('');
  };
  // 대륜탑이 아직 연결되지 않아, 대륜탑이 기일 변경을 보내 온 것처럼 흉내 냅니다.
  const demo = () => {
    const r = actions.syncHearing(room.id, demoUpdate(ci.deadlines), 'daeryuntop');
    setError(r.ok ? '' : r.reason);
  };
  const total = ci.costs.reduce((s, x) => s + x.amount, 0);
  const hearings = canEdit ? ci.deadlines : ci.deadlines.filter((d) => !d.firmOnly);
  const nextHearing = [...hearings].filter((d) => dDay(d.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
  const openLimits = canEdit ? [...(ci.limits ?? [])].filter((d) => !d.handledAt).sort((a, b) => a.due.localeCompare(b.due)) : [];
  const toggle = () => {
    folded.set(room.id, !open);
    setOpen(!open);
  };
  return (
    <Card style={{ paddingVertical: space.md }}>
      <Pressable accessibilityLabel={open ? '사건 자료 접기' : '사건 자료 펼치기'} onPress={toggle} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Badge label={ci.stage} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: family.bold, fontSize: 15, color: c.text }}>{ci.title}</Text>
          <Text numberOfLines={1} style={{ fontFamily: family.regular, fontSize: 12, color: c.sub }}>{ci.field}</Text>
        </View>
        <View style={{ transform: [{ rotate: open ? '270deg' : '90deg' }] }}>
          <Icon name="chevron" color={c.sub} size={18} />
        </View>
      </Pressable>
      {!open ? (
        <View style={{ marginTop: space.sm, gap: space.xs }}>
          {nextHearing ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <DBadge date={nextHearing.date} />
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: family.regular, fontSize: 13, color: c.text }}>{nextHearing.label} · {whenLabel(nextHearing.date, nextHearing.time)}</Text>
            </View>
          ) : null}
          {openLimits.length ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Badge fixed label={limitStatus(openLimits[0]).label} tone={limitStatus(openLimits[0]).tone} />
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: family.regular, fontSize: 13, color: c.text }}>
                불변기간 {openLimits[0].label}{openLimits.length > 1 ? ` 외 ${openLimits.length - 1}건` : ''}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
      <>
      <View style={{ marginTop: space.sm }}>
        <HearingList hearings={hearings} />
      </View>
      {canEdit && (ci.limits?.length || ci.limitAlerts === false) ? <LimitList room={room} /> : null}
      {canEdit ? <LimitFinder room={room} /> : null}
      <View style={{ marginTop: space.sm, gap: 2 }}>
        <Sub>진행: {ci.progress.map((p) => p.note).join(' → ')}</Sub>
        <Sub>서류: {ci.documents.length ? ci.documents.map((d) => d.name).join(', ') : '없음'}</Sub>
        <Sub>비용: {ci.costs.length ? `${total.toLocaleString('ko-KR')}원 (${ci.costs.length}건)` : '없음'}</Sub>
      </View>
      {canEdit ? (
        <View style={{ marginTop: space.md }}>
          <Chips>
            {STAGES.map((s) => <Chip key={s} label={`단계: ${s}`} active={ci.stage === s} onPress={() => actions.setCaseStage(room.id, s)} />)}
          </Chips>
          <Chips>
            {TYPES.map((t) => <Chip key={t.key} label={`+ ${t.label}`} active={type === t.key} onPress={() => setType(t.key)} />)}
          </Chips>
          <Input placeholder={type === 'limit' ? '불변기간 (예: 항소기간)' : '내용'} value={label} onChangeText={setLabel} />
          {type === 'deadline' ? (
            <>
              <Input placeholder="날짜 (예: 2026-11-02)" value={extra} onChangeText={setExtra} />
              <Input placeholder="시각 (예: 14:30)" value={time} onChangeText={setTime} />
              <Input placeholder="장소 (법정)" value={place} onChangeText={setPlace} />
            </>
          ) : null}
          {type === 'limit' ? (
            <>
              <Input placeholder="만료일 (예: 2026-11-02)" value={extra} onChangeText={setExtra} />
              {lawyers.length > 1 ? (
                <Chips>
                  <Chip label="담당: 변호사 전원" active={!lawyerId} onPress={() => setLawyerId(undefined)} />
                  {lawyers.map((u) => <Chip key={u.id} label={`담당: ${u.nickname}`} active={lawyerId === u.id} onPress={() => setLawyerId(u.id)} />)}
                </Chips>
              ) : null}
            </>
          ) : null}
          {error ? <Notice text={error} /> : null}
          {type === 'cost' ? <Input placeholder="금액 (원)" keyboardType="numeric" value={extra} onChangeText={setExtra} /> : null}
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            <Button label="추가" kind="soft" small onPress={add} />
            <Button label="대륜탑 기일 연동 시연" kind="ghost" small onPress={demo} />
          </View>
        </View>
      ) : null}
      </>
      )}
    </Card>
  );
}

/** 불변기간 목록 (변호사·직원만 봄): 남은 날, 담당, 조치 완료 */
function LimitList({ room }: { room: Room }) {
  const s = useApp();
  const c = useColors();
  const ci = room.caseInfo!;
  const [error, setError] = useState('');
  const run = (r: { ok: true } | { ok: false; reason: string }) => setError(r.ok ? '' : r.reason);
  return (
    <View style={{ marginTop: space.sm, gap: space.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <T bold>불변기간</T>
        {ci.limitAlerts === false ? <Badge label="알림 꺼짐" tone="plain" /> : null}
      </View>
      {(ci.limits ?? []).map((d) => {
        const st = limitStatus(d);
        const who = d.lawyerId ? limitLawyers(room, d, s.users).map((u) => u.nickname).join(', ') : '변호사 전원';
        return (
          <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: c.line }}>
            <Badge fixed label={st.label} tone={st.tone} />
            <View style={{ flex: 1, minWidth: 160 }}>
              <Text style={{ fontFamily: family.semibold, fontSize: 14, color: c.text }}>{d.label}</Text>
              <Text style={{ fontFamily: family.regular, fontSize: 12, color: c.sub }}>{limitWhen(d)} · 담당 {who}{d.source === 'daeryuntop' ? ' · 대륜탑' : ''}</Text>
            </View>
            <Button label={d.handledAt ? '완료 취소' : '조치 완료'} kind={d.handledAt ? 'ghost' : 'soft'} small onPress={() => run(actions.setLimitHandled(room.id, d.id, !d.handledAt))} />
            {d.source !== 'daeryuntop' ? (
              <Pressable accessibilityLabel={`${d.label} 삭제`} hitSlop={8} onPress={() => run(actions.removeLimit(room.id, d.id))}>
                <Text style={{ fontFamily: family.regular, fontSize: 13, color: c.sub }}>삭제</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
      {error ? <Notice text={error} /> : null}
    </View>
  );
}

const kstToday = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일`;

/** 상담내용으로 불변기간 찾기 (변호사·직원만): 법조문 기준으로 계산한 후보를 확인하고 등록합니다. */
function LimitFinder({ room }: { room: Room }) {
  const s = useApp();
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [bases, setBases] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ text: string; ok: boolean }>();
  const today = kstToday();
  const found = text.trim() ? suggestLimits(text, today) : [];
  const registered = new Set((room.caseInfo!.limits ?? []).map((d) => `${d.label}:${d.due}`));
  // 이 방에서 사람이 쓴 글 (상담 대화)
  const fromRoom = () =>
    setText(s.messages.filter((m) => m.roomId === room.id && m.kind === 'text' && m.text.trim()).slice(-60).map((m) => m.text).join('\n'));
  const withBase = (x: LimitSuggestion): LimitSuggestion => {
    const b = bases[x.key];
    return b && /^\d{4}-\d{2}-\d{2}$/.test(b) && !Number.isNaN(Date.parse(b)) ? { ...x, base: b, movedFrom: undefined, ...dueDate(b, x.period) } : x;
  };
  if (!open) {
    return (
      <View style={{ marginTop: space.sm }}>
        <Button label="상담내용으로 불변기간 찾기" kind="soft" small onPress={() => setOpen(true)} />
      </View>
    );
  }
  return (
    <View style={{ marginTop: space.sm, gap: space.xs }}>
      <T bold>상담내용으로 불변기간 찾기</T>
      <Input multiline placeholder="상담내용 붙여넣기 (예: 10월 15일 1심 판결문을 받았습니다)" value={text} onChangeText={setText} />
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <Button label="이 방 대화에서 가져오기" kind="ghost" small onPress={fromRoom} />
        <Button label="닫기" kind="ghost" small onPress={() => setOpen(false)} />
      </View>
      {text.trim() && !found.length ? <Sub>찾은 불변기간이 없습니다. 판결·결정·처분을 받은 날과 종류가 들어가면 찾습니다.</Sub> : null}
      {found.map(withBase).map((x) => {
        const done = x.due ? registered.has(`${x.label}:${x.due}`) : false;
        return (
          <View key={x.key} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.line, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
              {x.due ? <Badge fixed label={limitStatus({ id: x.key, label: x.label, due: x.due }).label} tone={limitStatus({ id: x.key, label: x.label, due: x.due }).tone} /> : <Badge fixed label="기준일 필요" tone="plain" />}
              <Text style={{ flex: 1, minWidth: 140, fontFamily: family.semibold, fontSize: 14, color: c.text }}>
                {x.label}{x.due ? ` · ${md(x.due)} 24:00 만료` : ''}
              </Text>
              {x.due ? (
                <Button
                  label={done ? '등록됨' : '등록'}
                  small
                  kind={done ? 'ghost' : 'primary'}
                  disabled={done}
                  onPress={() => {
                    const r = actions.addLimit(room.id, { label: x.label, due: x.due! });
                    setMsg(r.ok ? { text: `${x.label}을(를) 불변기간으로 등록했습니다.`, ok: true } : { text: r.reason, ok: false });
                  }}
                />
              ) : null}
            </View>
            <Text style={{ fontFamily: family.regular, fontSize: 12, color: c.sub }}>
              {x.basis} {x.base ? md(x.base) : '(못 찾음)'}부터 {periodLabel(x.period)} · {x.law}
              {x.movedFrom ? ` · ${md(x.movedFrom)}이 쉬는 날이라 다음 평일` : ''}
            </Text>
            <Input placeholder={`${x.basis} (예: ${today})`} value={bases[x.key] ?? ''} onChangeText={(v) => setBases((b) => ({ ...b, [x.key]: v.trim() }))} accessibilityLabel={`${x.label} 기준일`} />
          </View>
        );
      })}
      {found.length ? <Sub>법조문 기준 자동 계산입니다. 기준일과 만료일을 확인한 뒤 등록해 주세요.</Sub> : null}
      {msg ? <Notice text={msg.text} tone={msg.ok ? 'accent' : 'warn'} /> : null}
    </View>
  );
}
