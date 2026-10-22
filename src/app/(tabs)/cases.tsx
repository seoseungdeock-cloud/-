import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { limitStatus } from '@/core/deadlines';
import { dDay, dDayLabel } from '@/core/hearings';
import { Icon } from '@/ui/icons';
import { Button, Empty, Screen } from '@/ui/kit';
import type { Room, User } from '@/core/types';
import { family, radius, space, useColors } from '@/ui/theme';
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

/** 묶음 제목: 회색 띠 + 건수. 아래 사건 줄과 한눈에 구분됩니다 */
function Head({ title, count, right }: { title: string; count?: number; right?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.surface, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 8, marginTop: space.lg }}>
      <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: c.text }} />
      <Text style={{ ...family.bold, fontSize: 14, color: c.text }}>{title}</Text>
      {count !== undefined ? <Text style={{ ...family.bold, fontSize: 14, color: c.accent }}>{count}</Text> : null}
      <View style={{ marginLeft: 'auto' }}>{right}</View>
    </View>
  );
}

type Limit = { r: Room; d: NonNullable<NonNullable<Room['caseInfo']>['limits']>[number] };

/** 불변기간: 목록과 섞지 않고 맨 위 빨간 공지 띠로. 급한 3건만, 나머지는 펼쳐 보기 */
function UrgentLimits({ limits, onOpen }: { limits: Limit[]; onOpen: (id: string) => void }) {
  const c = useColors();
  const [all, setAll] = useState(false);
  const shown = all ? limits : limits.slice(0, 3);
  return (
    <View style={{ borderRadius: radius.md, borderWidth: 1.5, borderColor: c.accent, backgroundColor: c.accentSoft, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.accent, paddingHorizontal: space.md, paddingVertical: 7 }}>
        <Icon name="notice" color="#FFFFFF" size={16} />
        <Text style={{ ...family.bold, fontSize: 14, color: '#FFFFFF' }}>불변기간 {limits.length}건</Text>
        <Text style={{ ...family.regular, fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>만료일 24:00까지 조치</Text>
        {limits.length > 3 ? (
          <Pressable onPress={() => setAll((v) => !v)} hitSlop={8} style={{ marginLeft: 'auto' }}>
            <Text style={{ ...family.semibold, fontSize: 12, color: '#FFFFFF' }}>{all ? '접기' : `모두 보기 (${limits.length})`}</Text>
          </Pressable>
        ) : null}
      </View>
      {shown.map(({ r, d }, i) => {
        const st = limitStatus(d);
        const hot = st.tone === 'warn';
        return (
          <Pressable key={d.id} onPress={() => onOpen(r.id)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: 'rgba(168,34,53,0.15)', opacity: pressed ? 0.6 : 1 })}>
            <View style={{ minWidth: 58, alignItems: 'center', borderRadius: radius.pill, paddingVertical: 2, paddingHorizontal: 6, backgroundColor: hot ? c.accent : c.bg, borderWidth: 1, borderColor: c.accent }}>
              <Text style={{ ...family.bold, fontSize: 11, color: hot ? '#FFFFFF' : c.accent }}>{st.label}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ ...family.bold, fontSize: 14, color: c.text }}>{d.label}</Text>
              <Text numberOfLines={1} style={{ ...family.regular, fontSize: 12, color: c.sub }}>{caseLine(r)} · {d.due} 24:00</Text>
            </View>
            <Icon name="chevron" color={c.faint} size={16} />
          </Pressable>
        );
      })}
    </View>
  );
}

type Scope = 'open' | 'closed' | 'all';
const SCOPES: [Scope, string][] = [['open', '현행'], ['closed', '종결'], ['all', '현행+종결']];

export default function CasesScreen() {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<Scope>('open');
  const mine = s.rooms.filter((r) => r.memberIds.includes(user.id));
  const cases = mine.filter((r) => r.kind === 'case');
  const consults = mine.filter((r) => r.kind === 'consult');
  const open = (id: string) => router.push({ pathname: '/room/[id]', params: { id } });
  // 남은 불변기간 (변호사·직원): 조치 완료 안 한 것, 만료일 순
  const limits = user.role === 'client' ? [] : cases
    .flatMap((r) => (r.caseInfo!.limits ?? []).filter((d) => !d.handledAt).map((d) => ({ r, d })))
    .sort((a, b) => a.d.due.localeCompare(b.d.due));
  const nextOf = (r: Room) =>
    [...r.caseInfo!.deadlines].filter((d) => dDay(d.date) >= 0 && (user.role !== 'client' || !d.firmOnly)).sort((a, b) => a.date.localeCompare(b.date))[0];
  // 검색: 의뢰인 이름, 사건번호, 사건명, 분야. 다음 기일이 빠른 순
  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return cases
      .filter((r) => (scope === 'all' ? true : scope === 'closed' ? r.caseInfo!.stage === '종결' : r.caseInfo!.stage !== '종결'))
      .filter((r) => {
        const hay = [parties(r, s.users), caseLine(r), r.caseInfo!.field].join(' ').toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => (nextOf(a)?.date ?? '9999').localeCompare(nextOf(b)?.date ?? '9999'));
  }, [cases, q, scope, s.users]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen title="사건">
      {limits.length ? <UrgentLimits limits={limits} onOpen={open} /> : null}

      <Head title={user.role === 'client' ? '내 사건' : '진행 중인 사건'} />
      <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.sm }}>
        {SCOPES.map(([k, label]) => (
          <Pressable key={k} onPress={() => setScope(k)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: scope === k ? c.accent : c.line, alignItems: 'center', justifyContent: 'center' }}>
              {scope === k ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} /> : null}
            </View>
            <Text style={{ ...family.regular, fontSize: 13, color: scope === k ? c.text : c.sub }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.surface, borderRadius: radius.md, paddingHorizontal: space.md, marginTop: space.sm }}>
        <Icon name="search" color={c.faint} size={16} />
        <TextInput value={q} onChangeText={setQ} placeholder="의뢰인·사건번호·사건명 검색" placeholderTextColor={c.faint} style={{ flex: 1, minWidth: 0, paddingVertical: 9, color: c.text, fontSize: 14, ...family.regular, outlineStyle: 'none' } as object} />
        {q ? (
          <Pressable accessibilityLabel="검색어 지우기" hitSlop={8} onPress={() => setQ('')}>
            <Icon name="close" color={c.faint} size={14} />
          </Pressable>
        ) : null}
      </View>
      <Text style={{ ...family.bold, fontSize: 13, color: c.sub, marginTop: space.md, marginBottom: 2 }}>
        Total : <Text style={{ color: c.accent }}>{list.length}</Text> 건
      </Text>
      {list.length ? (
        list.map((r) => {
          const ci = r.caseInfo!;
          const next = nextOf(r);
          const n = next ? dDay(next.date) : 0;
          return next ? (
            <CaseRow key={r.id} top={parties(r, s.users)} mid={caseLine(r)} date={next.date} tag={dDayLabel(n)} warn={n <= 3} rest={`${next.time ?? '00:00'} / ${next.label}`} onPress={() => open(r.id)} />
          ) : (
            <CaseRow key={r.id} top={parties(r, s.users)} mid={caseLine(r)} rest={`${ci.field} · ${ci.stage} · 잡힌 기일 없음`} onPress={() => open(r.id)} />
          );
        })
      ) : (
        <Empty text={q ? '검색 결과가 없습니다.' : '사건이 없습니다.'} />
      )}

      <Head title="상담" count={consults.length} />
      {consults.length ? (
        consults.map((r) => <CaseRow key={r.id} top={parties(r, s.users)} mid={`상담 / ${r.title}`} onPress={() => open(r.id)} />)
      ) : (
        <View style={{ gap: space.sm }}>
          <Empty text="상담 내역이 없습니다." />
          {/* 변호사 계정의 사건 탭은 추후 대륜탑 기능을 붙일 자리라 변호사 찾기를 두지 않습니다. */}
          {user.role !== 'lawyer' ? <Button label="변호사 찾기" kind="soft" onPress={() => router.push('/find')} /> : null}
        </View>
      )}
    </Screen>
  );
}
