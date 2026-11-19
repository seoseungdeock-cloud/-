import { router } from 'expo-router';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { branchGroups, displayName, orgGroups, orgLine, presenceOf } from '@/core/messenger';
import { actions } from '@/core/store';
import type { User } from '@/core/types';
import { Icon } from './icons';
import { Avatar, Empty } from './kit';
import { Slide } from './motion';
import { usePresenceBadge } from './presence';
import { useBoxes } from './segments';
import { family, radius, space, useColors } from './theme';
import { useApp, useMe } from './use-app';

const ROLE_LABEL = { client: '의뢰인', lawyer: '변호사', staff: '직원', admin: '어드민' } as const;

export function ContactRow({ u, left, onPress, me, omitDept }: { u: User; left?: ReactNode; onPress?: () => void; me?: boolean; omitDept?: boolean }) {
  const c = useColors();
  const s = useApp();
  const user = useMe();
  const fav = (s.favorites[user.id] ?? []).includes(u.id);
  const dot = usePresenceBadge();
  const presence = presenceOf(u);
  return (
    <Pressable
      onPress={onPress ?? (() => router.push({ pathname: '/contact/[id]', params: { id: u.id } }))}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm + 4, paddingVertical: 7, opacity: pressed ? 0.6 : 1 })}>
      {left}
      <Avatar name={u.nickname} size={38} uri={u.photo} badge={u.role === 'client' ? undefined : dot(u)} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ ...family.bold, fontSize: 14, color: c.text }}>{displayName(u)}</Text>
        <Text numberOfLines={1} style={{ ...family.regular, fontSize: 12, color: c.sub, marginTop: 1 }}>
          {me ? '나 · ' : ''}
          {orgLine(u, omitDept) || ROLE_LABEL[u.role]}
          {u.role !== 'client' && presence.key !== 'available' ? ` · ${presence.label}` : ''}
        </Text>
      </View>
      {fav ? <Icon name="star" color={c.accent} size={16} /> : null}
    </Pressable>
  );
}

// 조직도: TOP → 지점(또는 부서) → 부서 → 구성원. 사람은 직급 순, 부서는 대륜탑 표시 순서.
export function OrgBrowser({ people, dept, onDept, renderMember }: { people: User[]; dept?: string; onDept: (d?: string) => void; renderMember: (u: User, inDept?: boolean) => ReactNode }) {
  const c = useColors();
  const hasBranch = people.some((u) => u.branch);
  const [mode, setMode] = useState<'branch' | 'dept'>(hasBranch ? 'branch' : 'dept');
  const [branch, setBranch] = useState<string>();
  const branches = useMemo(() => branchGroups(people), [people]);
  const depts = useMemo(() => orgGroups(people), [people]);
  const curBranch = mode === 'branch' && branch ? branches.find((b) => b.branch === branch) : undefined;
  // 부서는 지점 안에서 골랐으면 그 지점 사람만, 아니면 회사 전체에서
  const curDept = dept ? (curBranch ? curBranch.depts : depts).find((g) => g.dept === dept) : undefined;
  const crumb = (label: string, active: boolean, onPress?: () => void) => (
    <Pressable key={label} onPress={onPress} disabled={!onPress} hitSlop={8}>
      <Text numberOfLines={1} style={{ ...(active ? family.bold : family.regular), fontSize: 14, color: active ? c.text : c.faint, maxWidth: 160 }}>{label}</Text>
    </Pressable>
  );
  const sep = (k: string) => <Icon key={k} name="chevron" color={c.faint} size={14} />;
  const groupRow = (label: string, count: number, onPress: () => void, icon: 'people' | 'building' = 'people') => (
    <Pressable key={label} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm + 4, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} color={c.sub} size={18} />
      </View>
      <Text numberOfLines={1} style={{ flex: 1, ...family.semibold, fontSize: 15, color: c.text }}>{label}</Text>
      <Text style={{ ...family.regular, fontSize: 13, color: c.faint }}>{count}</Text>
      <Icon name="chevron" color={c.faint} size={16} />
    </Pressable>
  );
  const chatAll = (members: User[], title: string) => (
    <Pressable
      accessibilityLabel={`${title} 전체 대화`}
      hitSlop={10}
      style={{ marginLeft: 'auto' }}
      onPress={() => {
        const res = actions.startChat(members.map((u) => u.id), title);
        if (res.ok) router.push({ pathname: '/room/[id]', params: { id: res.roomId! } });
      }}>
      <Icon name="chat" color={c.accent} size={22} />
    </Pressable>
  );
  const countLine = (members: User[], title: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm }}>
      <Text style={{ ...family.regular, fontSize: 14, color: c.sub }}>
        전체 <Text style={{ color: c.accent, ...family.bold }}>{members.length}</Text>
      </Text>
      {chatAll(members, title)}
    </View>
  );
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.line }}>
        {crumb('TOP', !curBranch && !curDept, () => { setBranch(undefined); onDept(undefined); })}
        {curBranch ? [sep('s1'), crumb(curBranch.branch, !curDept, curDept ? () => onDept(undefined) : undefined)] : null}
        {curDept ? [sep('s2'), crumb(curDept.dept, true)] : null}
        {!curBranch && !curDept && hasBranch ? (
          <View style={{ marginLeft: 'auto', flexDirection: 'row', gap: 2, backgroundColor: c.surface, borderRadius: radius.pill, padding: 2 }}>
            {(['branch', 'dept'] as const).map((k) => (
              <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: mode === k }} onPress={() => setMode(k)} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: mode === k ? c.bg : 'transparent' }}>
                <Text style={{ ...family.semibold, fontSize: 12.5, color: mode === k ? c.text : c.faint }}>{k === 'branch' ? '지점별' : '부서별'}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      {curDept ? (
        <>
          {countLine(curDept.members, curDept.dept)}
          {curDept.members.map((u) => <View key={u.id}>{renderMember(u, true)}</View>)}
        </>
      ) : curBranch ? (
        <>
          {countLine(curBranch.members, curBranch.branch)}
          {/* 지점 안은 부서 제목 아래 사람을 바로 보여 줍니다. 부서 제목을 누르면 그 부서만 */}
          {curBranch.depts.map((g) => (
            <View key={g.dept} style={{ marginBottom: space.sm }}>
              <Pressable onPress={() => onDept(g.dept)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}>
                <Text style={{ ...family.bold, fontSize: 14, color: c.sub }}>{g.dept}</Text>
                <Text style={{ ...family.regular, fontSize: 13, color: c.faint }}>{g.members.length}</Text>
                <Icon name="chevron" color={c.faint} size={14} />
              </Pressable>
              {g.members.map((u) => <View key={u.id}>{renderMember(u, true)}</View>)}
            </View>
          ))}
        </>
      ) : !people.length ? (
        <Empty text="주소록에 표시할 사람이 없습니다." />
      ) : mode === 'branch' ? (
        branches.map((b) => groupRow(b.branch, b.members.length, () => setBranch(b.branch), 'building'))
      ) : (
        depts.map((g) => groupRow(g.dept, g.members.length, () => onDept(g.dept)))
      )}
    </View>
  );
}

// 밑줄 탭 (조직도/외부 연락처, 전체/구성원/조직·그룹 등)
export function UnderlineTabs<K extends string>({ tabs, value, onChange, dots, scroll }: { tabs: [K, string][]; value: K; onChange: (k: K) => void; dots?: Partial<Record<K, boolean>>; scroll?: boolean }) {
  const c = useColors();
  const { boxes, measure } = useBoxes<K>();
  const on = boxes[value];
  const row = (
    <View style={{ flexDirection: 'row', borderBottomWidth: scroll ? 0 : 1, borderBottomColor: c.lineStrong, position: 'relative' }}>
      {tabs.map(([k, label]) => (
        <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: value === k }} onLayout={measure(k)} onPress={() => onChange(k)} style={({ pressed }) => ({ paddingVertical: space.sm + 2, marginRight: space.lg + 4, flexDirection: 'row', opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ ...family.semibold, fontSize: 15, color: value === k ? c.text : c.faint, letterSpacing: -0.2 }}>{label}</Text>
          {dots?.[k] ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent, marginLeft: 2, marginTop: 2 }} /> : null}
        </Pressable>
      ))}
      {/* 고른 탭 아래 밑줄이 미끄러져 따라갑니다 */}
      <Slide x={on?.x ?? 0} width={on?.w ?? 0} height={2} color={c.text} radius={1} style={{ top: undefined, bottom: -1 }} />
    </View>
  );
  // 탭이 많으면 가로로 밀어 보거나 양옆 화살표로 넘깁니다.
  if (!scroll) return row;
  return <ScrollTabs>{row}</ScrollTabs>;
}
function ScrollTabs({ children }: { children: ReactNode }) {
  const c = useColors();
  const ref = useRef<ScrollView>(null);
  const [x, setX] = useState(0);
  const [box, setBox] = useState(0);
  const [content, setContent] = useState(0);
  const max = Math.max(0, content - box);
  const move = (dir: 1 | -1) => ref.current?.scrollTo({ x: Math.min(max, Math.max(0, x + dir * box * 0.7)), animated: true });
  const arrow = (dir: 1 | -1) => (
    <Pressable
      accessibilityLabel={dir < 0 ? '앞 게시판' : '다음 게시판'}
      onPress={() => move(dir)}
      hitSlop={6}
      style={{ position: 'absolute', top: 0, bottom: 1, [dir < 0 ? 'left' : 'right']: 0, width: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, shadowColor: c.bg, shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: dir * -12, height: 0 } }}>
      <Icon name={dir < 0 ? 'back' : 'chevron'} color={c.text} size={20} />
    </Pressable>
  );
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: c.line }} onLayout={(e) => setBox(e.nativeEvent.layout.width)}>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        onContentSizeChange={(w) => setContent(w)}
        onScroll={(e) => setX(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={32}>
        {children}
      </ScrollView>
      {x > 2 ? arrow(-1) : null}
      {x < max - 2 ? arrow(1) : null}
    </View>
  );
}
