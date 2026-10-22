import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { limitStatus } from '@/core/deadlines';
import { dDay, dDayLabel } from '@/core/hearings';
import { Button, Empty, Screen, Section } from '@/ui/kit';
import type { Room, User } from '@/core/types';
import { family, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

// 대륜탑 앱 목록 형식 (게시글 크기): 1줄 당사자, 2줄 사건번호 / 사건명, 3줄 날짜 [D-n] 시간 / 기일
function CaseRow({ top, mid, date, tag, warn, rest, onPress }: { top: string; mid: string; date?: string; tag?: string; warn?: boolean; rest?: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ paddingVertical: space.sm + 2, borderBottomWidth: 1, borderBottomColor: c.line, gap: 2, opacity: pressed ? 0.6 : 1 })}>
      <Text numberOfLines={1} style={{ ...family.bold, fontSize: 15, color: c.text }}>{top}</Text>
      <Text numberOfLines={1} style={{ ...family.semibold, fontSize: 13, color: c.accent }}>{mid}</Text>
      {date || rest ? (
        <Text numberOfLines={1} style={{ ...family.regular, fontSize: 13, color: c.sub }}>
          {date ? `${date} ` : ''}
          {tag ? <Text style={{ ...family.semibold, color: warn ? c.warn : c.sub }}>[{tag}]</Text> : null}
          {rest ? `${date ? ' ' : ''}${rest}` : ''}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** 1줄: 의뢰인 / 상대방 (상대방 정보가 없으면 -) */
const parties = (r: Room, users: User[]) => {
  const clients = r.memberIds.map((id) => users.find((u) => u.id === id)).filter((u) => u?.role === 'client').map((u) => u!.nickname);
  return `${clients.join(', ') || r.caseInfo?.title || r.title} / -`;
};
const caseLine = (r: Room) => [r.caseInfo?.caseNo, r.caseInfo?.title ?? r.title].filter(Boolean).join(' / ');

export default function CasesScreen() {
  const s = useApp();
  const user = useMe();
  const mine = s.rooms.filter((r) => r.memberIds.includes(user.id));
  const cases = mine.filter((r) => r.kind === 'case');
  const consults = mine.filter((r) => r.kind === 'consult');
  const open = (id: string) => router.push({ pathname: '/room/[id]', params: { id } });
  // 남은 불변기간 (변호사·직원): 조치 완료 안 한 것, 만료일 순
  const limits = user.role === 'client' ? [] : cases
    .flatMap((r) => (r.caseInfo!.limits ?? []).filter((d) => !d.handledAt).map((d) => ({ r, d })))
    .sort((a, b) => a.d.due.localeCompare(b.d.due));
  return (
    <Screen title="사건">
      {limits.length ? (
        <Section title={`남은 불변기간 ${limits.length}건`}>
          {limits.map(({ r, d }) => {
            const st = limitStatus(d);
            return <CaseRow key={d.id} top={parties(r, s.users)} mid={caseLine(r)} date={d.due} tag={st.label} warn={st.tone === 'warn'} rest={`24:00 / ${d.label}`} onPress={() => open(r.id)} />;
          })}
        </Section>
      ) : null}
      <Section title="진행 중인 사건">
        {cases.length ? (
          cases.map((r) => {
            const ci = r.caseInfo!;
            const next = [...ci.deadlines].filter((d) => dDay(d.date) >= 0 && (user.role !== 'client' || !d.firmOnly)).sort((a, b) => a.date.localeCompare(b.date))[0];
            const n = next ? dDay(next.date) : 0;
            return next ? (
              <CaseRow key={r.id} top={parties(r, s.users)} mid={caseLine(r)} date={next.date} tag={dDayLabel(n)} warn={n <= 3} rest={`${next.time ?? '00:00'} / ${next.label}`} onPress={() => open(r.id)} />
            ) : (
              <CaseRow key={r.id} top={parties(r, s.users)} mid={caseLine(r)} rest={`${ci.field} · ${ci.stage} · 잡힌 기일 없음`} onPress={() => open(r.id)} />
            );
          })
        ) : (
          <Empty text="아직 사건이 없습니다." />
        )}
      </Section>
      <Section title="상담">
        {consults.length ? (
          consults.map((r) => <CaseRow key={r.id} top={parties(r, s.users)} mid={`상담 / ${r.title}`} onPress={() => open(r.id)} />)
        ) : (
          <View style={{ gap: space.sm }}>
            <Empty text="상담 내역이 없습니다." />
            {/* 변호사 계정의 사건 탭은 추후 대륜탑 기능을 붙일 자리라 변호사 찾기를 두지 않습니다. */}
            {user.role !== 'lawyer' ? <Button label="변호사 찾기" kind="soft" onPress={() => router.push('/find')} /> : null}
          </View>
        )}
      </Section>
    </Screen>
  );
}
