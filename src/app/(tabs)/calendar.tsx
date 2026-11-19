import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { calendarEvents, monthGrid, todayKst, type CalEvent } from '@/core/calendar';
import { kstDate, kstTime, occurrences, useWork, visibleEvents, type WorkEvent } from '@/core/work';
import { EventDetail, EventEditor } from '@/ui/event-sheet';
import { dateLabel, dDay, dDayLabel } from '@/core/hearings';
import { timeLabel } from '@/ui/hearing';
import { Icon } from '@/ui/icons';
import { Button, Empty, Screen } from '@/ui/kit';
import { Appear, Fade, Pop, Press } from '@/ui/motion';
import { SegmentBar } from '@/ui/segments';
import { family, radius, space, tracking, useColors } from '@/ui/theme';
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
  const w = useWork();
  const [editor, setEditor] = useState<{ open: boolean; initial?: WorkEvent }>({ open: false });
  const [detail, setDetail] = useState<WorkEvent>();
  // 손으로 넣은 일정: 이번 달 앞뒤 한 달 + 목록 보기용 90일을 펼쳐서 기일·불변기간과 섞습니다
  const workItems = useMemo(() => {
    const myRooms = new Set(s.rooms.filter((r) => r.memberIds.includes(user.id)).map((r) => r.id));
    const vis = visibleEvents(w, { id: user.id, dept: user.dept, firm: user.role !== 'client' }, myRooms);
    const from = `${ym.y}-${String(ym.m).padStart(2, '0')}-01`;
    const lo = from < today ? from : today;
    const hi = new Date(Date.UTC(ym.y, ym.m + 1, 0)).toISOString().slice(0, 10);
    const hi2 = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);
    const occ = vis.flatMap((e) => occurrences(e, lo, hi > hi2 ? hi : hi2));
    const scopeLabel = { personal: '내 일정', dept: '부서', firm: '회사', room: '대화방' } as const;
    return occ.map((e): CalEvent & { source: WorkEvent } => ({
      id: e.id, date: kstDate(e.startsAt), time: e.allDay ? undefined : kstTime(e.startsAt), endTime: e.allDay ? undefined : kstTime(e.endsAt),
      label: e.title, kind: 'event', roomId: e.roomId ?? '', caseTitle: '', place: e.place ?? w.resources.find((r) => r.id === e.resourceId)?.name, scopeLabel: scopeLabel[e.scope], source: e,
    }));
  }, [w, s.rooms, user, ym, today]);
  const events = useMemo(() => [...calendarEvents(user, s.rooms), ...workItems].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')), [user, s.rooms, workItems]);
  const openItem = (e: CalEvent) => {
    const src = (e as CalEvent & { source?: WorkEvent }).source;
    if (src) setDetail(src);
    else if (e.roomId) router.push({ pathname: '/room/[id]', params: { id: e.roomId } });
  };
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
  const tone = (e: CalEvent) => (e.kind === 'limit' ? (e.done ? c.faint : c.accent) : e.kind === 'event' ? c.accent : c.text);
  const bar = (e: CalEvent) => (e.kind === 'limit' ? c.accent : e.kind === 'event' ? '#2E5BFF' : c.text);
  const list = byDay[picked] ?? [];

  const navBtn = (dir: 1 | -1) => (
    <Press accessibilityLabel={dir < 0 ? '이전 달' : '다음 달'} onPress={() => shift(dir)} hitSlop={10} scale={0.85} style={({ hovered }) => ({ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.surface : 'transparent' })}>
      <Icon name={dir < 0 ? 'back' : 'chevron'} color={c.text} size={20} />
    </Press>
  );

  const toggle = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <SegmentBar items={[['list', '목록'], ['month', '달력']]} value={view} onChange={setView} />
      <Button small label="일정 추가" icon="plus" onPress={() => setEditor({ open: true })} />
    </View>
  );
  return (
    <Screen title="캘린더" right={toggle}>
      {editor.open ? <EventEditor open onClose={() => setEditor({ open: false })} initial={editor.initial} date={picked} /> : null}
      <EventDetail event={detail} onClose={() => setDetail(undefined)} onEdit={(e) => { setDetail(undefined); setEditor({ open: true, initial: e }); }} />
      {view === 'list' ? (
        <Fade key="list"><Agenda events={events} today={today} onOpen={openItem} /></Fade>
      ) : (
        <Fade key="month">
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
        {navBtn(-1)}
        <Fade key={monthKey}>
          <Text style={{ ...family.bold, fontSize: 20, color: c.text, marginHorizontal: space.sm, letterSpacing: tracking.h3 }}>{ym.y}년 {ym.m}월</Text>
        </Fade>
        {navBtn(1)}
        <Press onPress={goToday} scale={0.92} style={({ hovered }) => ({ marginLeft: 'auto', backgroundColor: hovered ? c.lineStrong : c.surface, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 })}>
          <Text style={{ ...family.semibold, fontSize: 13, color: c.text }}>오늘</Text>
        </Press>
      </View>

      <View style={{ flexDirection: 'row' }}>
        {WEEK.map((w, i) => (
          <Text key={w} style={{ flex: 1, textAlign: 'center', ...family.semibold, fontSize: 12, color: i === 0 ? SUN : i === 6 ? SAT : c.sub, paddingBottom: space.xs }}>{w}</Text>
        ))}
      </View>
      <Fade key={`grid-${monthKey}`} style={{ borderTopWidth: 1, borderTopColor: c.line }}>
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <View key={row} style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.line }}>
            {grid.slice(row * 7, row * 7 + 7).map((d, i) => {
              const inMonth = d.startsWith(monthKey);
              const isToday = d === today;
              const on = d === picked;
              const items = byDay[d] ?? [];
              const dayColor = i === 0 ? SUN : i === 6 ? SAT : c.text;
              return (
                <Press key={d} onPress={() => setPicked(d)} scale={0.94} style={({ hovered }) => ({ flex: 1, minHeight: 74, paddingTop: 4, paddingHorizontal: 2, gap: 2, borderRadius: radius.sm, backgroundColor: on ? c.accentSoft : hovered ? c.hover : 'transparent', opacity: inMonth ? 1 : 0.35 })}>
                  <View style={{ alignSelf: 'center', width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
                    {on || isToday ? <Pop key={on ? 'on' : 'today'} style={{ position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: isToday ? c.accent : c.navBg }}><View /></Pop> : null}
                    <Text style={{ ...(isToday || on ? family.bold : family.semibold), fontSize: 13, color: isToday || on ? '#FFFFFF' : dayColor }}>{Number(d.slice(8))}</Text>
                  </View>
                  {items.slice(0, 2).map((e) => (
                    <View key={e.id} style={{ borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1, backgroundColor: bar(e), opacity: e.done ? 0.45 : 1 }}>
                      <Text numberOfLines={1} style={{ ...family.semibold, fontSize: 10, color: e.kind === 'hearing' ? c.bg : '#FFFFFF' }}>{e.label}</Text>
                    </View>
                  ))}
                  {items.length > 2 ? <Text style={{ ...family.semibold, fontSize: 10, color: c.sub, textAlign: 'center' }}>+{items.length - 2}</Text> : null}
                </Press>
              );
            })}
          </View>
        ))}
      </Fade>

      <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.sm }}>
        <Legend color={c.text} label="기일" />
        {user.role !== 'client' ? <Legend color={c.accent} label="불변기간" /> : null}
        <Legend color="#2E5BFF" label="일정" />
      </View>

      <Fade key={`day-${picked}`}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginTop: space.xl, marginBottom: space.sm }}>
        <Text style={{ ...family.bold, fontSize: 17, color: c.text, letterSpacing: tracking.h3 }}>{dateLabel(picked)}</Text>
        <Text style={{ ...family.semibold, fontSize: 13, color: c.sub }}>{dDayLabel(dDay(picked))}</Text>
      </View>
      {list.length ? (
        list.map((e, i) => (
          <Appear key={e.id} index={i}>
          <Press onPress={() => openItem(e)} scale={0.98} style={({ hovered }) => ({ flexDirection: 'row', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md, marginHorizontal: -space.md, borderRadius: radius.md, backgroundColor: hovered ? c.hover : 'transparent' })}>
            <View style={{ width: 4, borderRadius: 2, backgroundColor: bar(e), opacity: e.done ? 0.3 : 1 }} />
            <View style={{ width: 52 }}>
              <Text style={{ ...family.bold, fontSize: 15, color: tone(e) }}>{e.time ?? '종일'}</Text>
              <Text style={{ ...family.semibold, fontSize: 11, color: c.sub, marginTop: 2 }}>{e.kind === 'limit' ? '불변기간' : e.kind === 'event' ? (e.scopeLabel ?? '일정') : '기일'}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ ...family.bold, fontSize: 15, color: c.text, textDecorationLine: e.done ? 'line-through' : 'none' }}>{e.label}</Text>
              <Text numberOfLines={1} style={{ ...family.regular, fontSize: 13, color: c.sub }}>{[e.caseTitle, e.endTime ? `~${e.endTime}` : '', e.place, e.done ? '조치 완료' : ''].filter(Boolean).join(' · ')}</Text>
            </View>
            <Icon name="chevron" color={c.faint} size={18} />
          </Press>
          </Appear>
        ))
      ) : (
        <Empty text="이 날은 일정이 없습니다." />
      )}
      </Fade>
        </Fade>
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
function Agenda({ events, today, onOpen }: { events: CalEvent[]; today: string; onOpen: (e: CalEvent) => void }) {
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
  let idx = 0;
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
                  <Appear key={e.id} index={idx++}>
                  <Press onPress={() => onOpen(e)} scale={0.98} style={({ hovered }) => ({ backgroundColor: hovered ? c.lineStrong : c.surface, borderRadius: radius.md, paddingVertical: space.sm + 2, paddingHorizontal: space.md, borderLeftWidth: 3, borderLeftColor: e.kind === 'limit' ? c.accent : e.kind === 'event' ? '#2E5BFF' : c.navBg })}>
                    <Text numberOfLines={2} style={{ ...family.bold, fontSize: 15, lineHeight: 21, color: c.text }}>{e.kind === 'event' ? e.label : `${e.label}, ${e.caseTitle}${lawyersOf(e.roomId)}`}</Text>
                    <Text numberOfLines={1} style={{ ...family.regular, fontSize: 13, color: c.sub, marginTop: 3 }}>
                      {e.kind === 'limit' ? '불변기간 · 24:00 만료' : e.kind === 'event' ? `${e.scopeLabel} · ${e.time ? `${timeLabel(e.time)}${e.endTime ? ` ~ ${timeLabel(e.endTime)}` : ''}` : '종일'}` : timeLabel(e.time) || '종일'}
                      {e.place ? `  |  ${e.place}` : ''}
                    </Text>
                  </Press>
                  </Appear>
                ))}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
