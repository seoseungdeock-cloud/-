import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { limitLawyers, limitStatus, limitWhen } from '@/core/deadlines';
import { demoUpdate } from '@/core/hearings';
import { actions } from '@/core/store';
import type { CaseStage, Room } from '@/core/types';
import { HearingList } from './hearing';
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
export function CasePanel({ room, canEdit }: { room: Room; canEdit: boolean }) {
  const ci = room.caseInfo!;
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
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Badge label={ci.stage} />
        <T bold>{ci.title}</T>
        <Sub>{ci.field}</Sub>
      </View>
      <View style={{ marginTop: space.sm }}>
        <HearingList hearings={ci.deadlines} />
      </View>
      {canEdit && (ci.limits?.length || ci.limitAlerts === false) ? <LimitList room={room} /> : null}
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
            <Badge label={st.label} tone={st.tone} />
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
