// 기일 알람 화면 조각: 사건방 알람 카드, 앱 어디서나 뜨는 확인 창, 사건 자료의 기일 목록
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { ackStatus, CHANGE_LABEL, clientUnackedHours, dDay, dDayLabel, pendingFor, reminderPlan, whenLabel } from '@/core/hearings';
import { actions } from '@/core/store';
import type { Hearing, HearingAlert } from '@/core/types';
import { Icon } from './icons';
import { BADGE_WIDTH } from './kit';
import { roomTitle } from './room-row';
import { family, radius, space, useColors } from './theme';
import { useApp, useMe } from './use-app';

export function DBadge({ date }: { date: string }) {
  const c = useColors();
  const n = dDay(date);
  const soon = n >= 0 && n <= 7;
  return (
    <Text numberOfLines={1} style={{ width: BADGE_WIDTH, textAlign: 'center', ...family.bold, fontSize: 12, color: soon ? '#FFFFFF' : c.accent, backgroundColor: soon ? c.accent : c.accentSoft, borderRadius: radius.pill, paddingVertical: 2, overflow: 'hidden' }}>
      {dDayLabel(n)}
    </Text>
  );
}

/** 알람 내용 (카드와 확인 창이 같이 씀) */
function AlertBody({ a, big }: { a: HearingAlert; big?: boolean }) {
  const c = useColors();
  const cancelled = a.change === 'cancelled';
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        <Icon name="calendar" color={c.accent} size={big ? 22 : 18} />
        <Text style={{ ...family.heavy, fontSize: big ? 20 : 16, color: c.accent }}>{CHANGE_LABEL[a.change]}</Text>
        {!cancelled ? <DBadge date={a.date} /> : null}
      </View>
      <Text style={{ ...family.bold, fontSize: big ? 17 : 15, color: c.text }}>{a.label}</Text>
      {a.change === 'changed' && a.prevDate ? (
        <Text style={{ ...family.regular, fontSize: 14, color: c.faint, textDecorationLine: 'line-through' }}>{whenLabel(a.prevDate, a.prevTime)}</Text>
      ) : null}
      <Text style={{ ...family.heavy, fontSize: big ? 24 : 19, color: cancelled ? c.faint : c.text, textDecorationLine: cancelled ? 'line-through' : 'none' }}>{whenLabel(a.date, a.time)}</Text>
      {a.place && !cancelled ? <Text style={{ ...family.regular, fontSize: 14, color: c.sub }}>{a.place}</Text> : null}
      <Text style={{ ...family.semibold, fontSize: 12, color: c.faint }}>{a.source === 'daeryuntop' ? '대륜탑 자동 연동' : '담당 변호사 입력'}</Text>
    </View>
  );
}

/** 사건방 안의 알람 카드: 누가 확인했는지 모두에게 보입니다. */
export function HearingCard({ alertId }: { alertId: string }) {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const a = s.hearingAlerts.find((x) => x.id === alertId);
  if (!a) return null;
  const status = ackStatus(a, s.users);
  const mine = a.recipients.includes(user.id) && !a.ackedBy[user.id];
  const missing = status.some((x) => !x.at);
  const unackedClient = clientUnackedHours(a, s.users);
  return (
    <View style={{ width: 250, gap: space.sm }}>
      <AlertBody a={a} />
      <View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: space.sm, gap: 3 }}>
        {status.map(({ user: u, at }) => (
          <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name={at ? 'check' : 'close'} color={at ? c.secure : c.accent} size={14} />
            <Text style={{ ...family.semibold, fontSize: 13, color: at ? c.sub : c.accent }}>
              {u.nickname}
              {u.role === 'client' ? ' (의뢰인)' : ''} {at ? '확인' : '미확인'}
            </Text>
          </View>
        ))}
      </View>
      {mine ? (
        <Pressable onPress={() => actions.ackHearing(a.id)} style={{ backgroundColor: c.accent, borderRadius: radius.md, paddingVertical: space.sm, alignItems: 'center' }}>
          <Text style={{ ...family.bold, fontSize: 14, color: '#FFFFFF' }}>확인했습니다</Text>
        </Pressable>
      ) : user.role !== 'client' && missing ? (
        <Pressable onPress={() => actions.remindHearing(a.id)} style={{ borderWidth: 1, borderColor: c.accent, borderRadius: radius.md, paddingVertical: space.sm, alignItems: 'center' }}>
          <Text style={{ ...family.bold, fontSize: 14, color: c.accent }}>
            다시 알리기{unackedClient !== undefined && unackedClient > 0 ? ` · 의뢰인 미확인 ${unackedClient}시간` : ''}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** 확인하지 않은 기일 알람이 있으면 어느 화면에서든 뜹니다. '확인했습니다'를 눌러야 닫힙니다. */
export function HearingAlertModal() {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const pending = pendingFor(user.id, s.hearingAlerts);
  const a = pending[0];
  if (!a) return null;
  const room = s.rooms.find((r) => r.id === a.roomId);
  const open = () => {
    actions.ackHearing(a.id);
    router.push({ pathname: '/room/[id]', params: { id: a.roomId } });
  };
  return (
    <Modal visible transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: space.lg }}>
        <View style={{ backgroundColor: c.bg, borderRadius: radius.lg, borderTopWidth: 6, borderTopColor: c.accent, padding: space.lg, gap: space.md, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text numberOfLines={1} style={{ flex: 1, ...family.semibold, fontSize: 13, color: c.sub }}>{room ? roomTitle(room) : '사건방'}</Text>
            {pending.length > 1 ? <Text style={{ ...family.bold, fontSize: 13, color: c.accent }}>1/{pending.length}</Text> : null}
          </View>
          <AlertBody a={a} big />
          <Pressable accessibilityLabel="기일 알람 확인" onPress={() => actions.ackHearing(a.id)} style={{ backgroundColor: c.accent, borderRadius: radius.md, paddingVertical: space.md, alignItems: 'center' }}>
            <Text style={{ ...family.bold, fontSize: 16, color: '#FFFFFF' }}>확인했습니다</Text>
          </Pressable>
          <Pressable onPress={open} style={{ paddingVertical: space.xs, alignItems: 'center' }}>
            <Text style={{ ...family.semibold, fontSize: 14, color: c.sub }}>확인하고 사건방 열기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** 사건 자료의 기일 목록: D-day, 시각·장소, 출처, 가장 가까운 기일의 미리 알림 일정 */
export function HearingList({ hearings }: { hearings: Hearing[] }) {
  const c = useColors();
  const [showPlan, setShowPlan] = useState(false);
  const sorted = [...hearings].sort((a, b) => a.date.localeCompare(b.date));
  const next = sorted.find((h) => dDay(h.date) >= 0);
  if (!sorted.length) return <Text style={{ ...family.regular, fontSize: 14, color: c.sub }}>기일: 없음</Text>;
  const plan = next ? reminderPlan(next) : [];
  const fmt = (iso: string) => {
    const k = new Date(Date.parse(iso) + 9 * 3_600_000);
    return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`;
  };
  return (
    <View style={{ gap: space.xs }}>
      {sorted.map((h) => (
        <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, opacity: dDay(h.date) < 0 ? 0.5 : 1 }}>
          <DBadge date={h.date} />
          <View style={{ flex: 1 }}>
            <Text style={{ ...family.bold, fontSize: 14, color: c.text }}>
              {h.label} · {whenLabel(h.date, h.time)}
            </Text>
            {h.place || h.source === 'daeryuntop' ? (
              <Text numberOfLines={1} style={{ ...family.regular, fontSize: 12, color: c.sub }}>{[h.place, h.source === 'daeryuntop' ? '대륜탑' : '', h.firmOnly ? '변호사·직원만' : ''].filter(Boolean).join(' · ')}</Text>
            ) : null}
          </View>
        </View>
      ))}
      {plan.length ? (
        <Pressable onPress={() => setShowPlan((v) => !v)} hitSlop={6}>
          <Text style={{ ...family.semibold, fontSize: 13, color: c.accent }}>
            미리 알림 {plan.length}회 {showPlan ? '' : `· ${plan.map((p) => p.label).join(', ')}`}
          </Text>
        </Pressable>
      ) : null}
      {showPlan ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
          {plan.map((p) => (
            <View key={p.label} style={{ borderWidth: 1, borderColor: c.line, borderRadius: radius.md, paddingHorizontal: space.sm, paddingVertical: 4 }}>
              <Text style={{ ...family.semibold, fontSize: 12, color: c.text }}>{p.label}</Text>
              <Text style={{ ...family.regular, fontSize: 12, color: c.sub }}>{fmt(p.at)}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
