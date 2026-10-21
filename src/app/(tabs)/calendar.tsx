import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { calendarEvents, monthGrid, todayKst, type CalEvent } from '@/core/calendar';
import { dateLabel, dDay, dDayLabel } from '@/core/hearings';
import { timeLabel } from '@/ui/hearing';
import { Icon } from '@/ui/icons';
import { Empty, Screen } from '@/ui/kit';
import { family, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const SUN = '#D93A3A';
const SAT = '#2F6FD6';

// 캘린더: 내 사건방의 기일(재판 일정)과 불변기간을 한 달 달력으로 봅니다.
export default function CalendarScreen() {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const today = todayKst();
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }));
  const [picked, setPicked] = useState(today);
  const [view, setView] = useState<'list' | 'month'>('list');
  const events = useMemo(() => calendarEvents(user, s.rooms), [user, s.rooms]);
  const byDay = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    for (const e of events) (map[e.date] ??= []).push(e);
    return map;
  }, [events]);
  const grid = monthGrid(ym.y, ym.m);
  const monthKey = `${ym.y}-${String(ym.m).padStart(2, '0')}`;
  const shift = (n: number) => setYm(({ y, m }) => {
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 };
  });
  const goToday = () => {
    setYm({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) });
    setPicked(today);
  };
  const tone = (e: CalEvent) => (e.kind === 'limit' ? (e.done ? c.faint : c.accent) : c.text);
  const list = byDay[picked] ?? [];

  const navBtn = (dir: 1 | -1) => (
    <Pressable accessibilityLabel={dir < 0 ? '이전 달' : '다음 달'} onPress={() => shift(dir)} hitSlop={10} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={dir < 0 ? 'back' : 'chevron'} color={c.text} size={20} />
    </Pressable>
  );

  const toggle = (
    <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderRadius: radius.pill, padding: 3 }}>
      {([['list', '목록'], ['month', '달력']] as const).map(([k, label]) => (
        <Pressable key={k} onPress={() => setView(k)} style={{ paddingHorizontal: space.md, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: view === k ? c.bg : 'transparent' }}>
          <Text style={{ ...(view === k ? family.bold : family.regular), fontSize: 13, color: view === k ? c.text : c.sub }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <Screen title="캘린더" right={toggle}>
      {view === 'list' ? (
        <Agenda events={events} today={today} />
      ) : (
        <>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
        {navBtn(-1)}
        <Text style={{ ...family.bold, fontSize: 20, color: c.text, marginHorizontal: space.sm }}>{ym.y}년 {ym.m}월</Text>
        {navBtn(1)}
        <Pressable onPress={goToday} style={{ marginLeft: 'auto', borderWidth: 1, borderColor: c.line, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 5 }}>
          <Text style={{ ...family.semibold, fontSize: 13, color: c.text }}>오늘</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row' }}>
        {WEEK.map((w, i) => (
          <Text key={w} style={{ flex: 1, textAlign: 'center', ...family.semibold, fontSize: 12, color: i === 0 ? SUN : i === 6 ? SAT : c.sub, paddingBottom: space.xs }}>{w}</Text>
        ))}
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: c.line }}>
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <View key={row} style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.line }}>
            {grid.slice(row * 7, row * 7 + 7).map((d, i) => {
              const inMonth = d.startsWith(monthKey);
              const isToday = d === today;
              const on = d === picked;
              const items = byDay[d] ?? [];
              const dayColor = i === 0 ? SUN : i === 6 ? SAT : c.text;
              return (
                <Pressable key={d} onPress={() => setPicked(d)} style={{ flex: 1, minHeight: 74, paddingTop: 4, paddingHorizontal: 2, gap: 2, backgroundColor: on ? c.accentSoft : 'transparent', opacity: inMonth ? 1 : 0.35 }}>
                  <View style={{ alignSelf: 'center', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? c.accent : 'transparent' }}>
                    <Text style={{ ...(isToday ? family.bold : family.semibold), fontSize: 13, color: isToday ? '#FFFFFF' : dayColor }}>{Number(d.slice(8))}</Text>
                  </View>
                  {items.slice(0, 2).map((e) => (
                    <View key={e.id} style={{ borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1, backgroundColor: e.kind === 'limit' ? c.accent : c.text, opacity: e.done ? 0.45 : 1 }}>
                      <Text numberOfLines={1} style={{ ...family.semibold, fontSize: 10, color: e.kind === 'limit' ? '#FFFFFF' : c.bg }}>{e.label}</Text>
                    </View>
                  ))}
                  {items.length > 2 ? <Text style={{ ...family.semibold, fontSize: 10, color: c.sub, textAlign: 'center' }}>+{items.length - 2}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.sm }}>
        <Legend color={c.text} label="기일" />
        {user.role !== 'client' ? <Legend color={c.accent} label="불변기간" /> : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginTop: space.xl, marginBottom: space.sm }}>
        <Text style={{ ...family.bold, fontSize: 17, color: c.text }}>{dateLabel(picked)}</Text>
        <Text style={{ ...family.semibold, fontSize: 13, color: c.sub }}>{dDayLabel(dDay(picked))}</Text>
      </View>
      {list.length ? (
        list.map((e) => (
          <Pressable key={e.id} onPress={() => router.push({ pathname: '/room/[id]', params: { id: e.roomId } })} style={({ pressed }) => ({ flexDirection: 'row', gap: space.md, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
            <View style={{ width: 4, borderRadius: 2, backgroundColor: e.kind === 'limit' ? c.accent : c.text, opacity: e.done ? 0.3 : 1 }} />
            <View style={{ width: 52 }}>
              <Text style={{ ...family.bold, fontSize: 15, color: tone(e) }}>{e.time ?? '종일'}</Text>
              <Text style={{ ...family.semibold, fontSize: 11, color: c.sub, marginTop: 2 }}>{e.kind === 'limit' ? '불변기간' : '기일'}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ ...family.bold, fontSize: 15, color: c.text, textDecorationLine: e.done ? 'line-through' : 'none' }}>{e.label}</Text>
              <Text numberOfLines={1} style={{ ...family.regular, fontSize: 13, color: c.sub }}>{[e.caseTitle, e.place, e.done ? '조치 완료' : ''].filter(Boolean).join(' · ')}</Text>
            </View>
            <Icon name="chevron" color={c.faint} size={18} />
          </Pressable>
        ))
      ) : (
        <Empty text="이 날은 일정이 없습니다." />
      )}
        </>
      )}
    </Screen>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color, borderWidth: 1, borderColor: c.line }} />
      <Text style={{ ...family.regular, fontSize: 12, color: c.sub }}>{label}</Text>
    </View>
  );
}

/** 목록 보기: 오늘부터 날짜별로 (휴대폰 일정 위젯처럼) */
function Agenda({ events, today }: { events: CalEvent[]; today: string }) {
  const s = useApp();
  const c = useColors();
  const days = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events) if (e.date >= today && !e.done) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return [...map.entries()];
  }, [events, today]);
  const lawyersOf = (roomId: string) => {
    const room = s.rooms.find((r) => r.id === roomId);
    const names = (room?.memberIds ?? []).map((id) => s.users.find((u) => u.id === id)).filter((u) => u?.role === 'lawyer').map((u) => u!.nickname);
    return names.length ? ` / ${names.join(', ')} 변호사님` : '';
  };
  if (!days.length) return <Empty text="다가오는 일정이 없습니다." />;
  let month = '';
  return (
    <View>
      {days.map(([date, items]) => {
        const m = date.slice(0, 7);
        const head = m !== month ? (month = m) : null;
        const w = WEEK[new Date(`${date}T00:00:00Z`).getUTCDay()];
        const isToday = date === today;
        return (
          <View key={date}>
            {head ? <Text style={{ ...family.bold, fontSize: 15, color: c.sub, marginTop: space.md, marginBottom: space.sm }}>{m.replace('-', '.')}</Text> : null}
            <View style={{ flexDirection: 'row', gap: space.md, marginBottom: space.md }}>
              <View style={{ width: 40, alignItems: 'center', paddingTop: 4 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? c.accent : c.surface }}>
                  <Text style={{ ...family.bold, fontSize: 16, color: isToday ? '#FFFFFF' : c.text }}>{Number(date.slice(8))}</Text>
                </View>
                <Text style={{ ...family.semibold, fontSize: 11, color: c.sub, marginTop: 3 }}>{isToday ? '오늘' : w}</Text>
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                {items.map((e) => (
                  <Pressable key={e.id} onPress={() => router.push({ pathname: '/room/[id]', params: { id: e.roomId } })} style={({ pressed }) => ({ backgroundColor: c.surface, borderRadius: radius.sm + 2, paddingVertical: space.sm + 2, paddingHorizontal: space.md, borderLeftWidth: 3, borderLeftColor: e.kind === 'limit' ? c.accent : c.text, opacity: pressed ? 0.7 : 1 })}>
                    <Text numberOfLines={2} style={{ ...family.bold, fontSize: 15, lineHeight: 21, color: c.text }}>{e.label}, {e.caseTitle}{lawyersOf(e.roomId)}</Text>
                    <Text numberOfLines={1} style={{ ...family.regular, fontSize: 13, color: c.sub, marginTop: 3 }}>
                      {e.kind === 'limit' ? '불변기간 · 24:00 만료' : timeLabel(e.time) || '종일'}
                      {e.place ? `  |  ${e.place}` : ''}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
