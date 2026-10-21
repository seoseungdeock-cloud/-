import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { displayName, orgGroups, presenceOf } from '@/core/messenger';
import { actions } from '@/core/store';
import type { User } from '@/core/types';
import { Icon } from './icons';
import { Avatar, Empty } from './kit';
import { usePresenceColor } from './presence';
import { family, space, useColors } from './theme';
import { useApp, useMe } from './use-app';

const ROLE_LABEL = { client: '의뢰인', lawyer: '변호사', staff: '직원', admin: '어드민' } as const;

export function ContactRow({ u, left, onPress, me }: { u: User; left?: ReactNode; onPress?: () => void; me?: boolean }) {
  const c = useColors();
  const s = useApp();
  const user = useMe();
  const fav = (s.favorites[user.id] ?? []).includes(u.id);
  const dot = usePresenceColor();
  const presence = presenceOf(u);
  return (
    <Pressable
      onPress={onPress ?? (() => router.push({ pathname: '/contact/[id]', params: { id: u.id } }))}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2, opacity: pressed ? 0.6 : 1 })}>
      {left}
      <Avatar name={u.nickname} size={48} uri={u.photo} dot={u.role === 'client' ? undefined : dot(u)} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ ...family.bold, fontSize: 16, color: c.text }}>{displayName(u)}</Text>
        <Text numberOfLines={1} style={{ ...family.regular, fontSize: 13, color: c.sub }}>
          {me ? '나 · ' : ''}
          {u.dept ?? ROLE_LABEL[u.role]}
          {u.role !== 'client' && presence.key !== 'available' ? ` · ${presence.label}` : ''}
        </Text>
      </View>
      {fav ? <Icon name="star" color={c.accent} size={18} /> : null}
    </Pressable>
  );
}

// 조직도: TOP에서 부서 목록 → 부서를 누르면 구성원 (전체 수, 부서 전체 대화)
export function OrgBrowser({ people, dept, onDept, renderMember }: { people: User[]; dept?: string; onDept: (d?: string) => void; renderMember: (u: User) => ReactNode }) {
  const c = useColors();
  const groups = orgGroups(people);
  const current = groups.find((g) => g.dept === dept);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.line }}>
        <Pressable onPress={() => onDept(undefined)} hitSlop={8}>
          <Text style={{ ...(current ? family.regular : family.bold), fontSize: 15, color: current ? c.faint : c.text }}>TOP</Text>
        </Pressable>
        {current ? (
          <>
            <Icon name="chevron" color={c.faint} size={14} />
            <Text style={{ ...family.bold, fontSize: 15, color: c.text }}>{current.dept}</Text>
          </>
        ) : null}
      </View>
      {current ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm }}>
            <Text style={{ ...family.regular, fontSize: 14, color: c.sub }}>
              전체 <Text style={{ color: c.accent, ...family.bold }}>{current.members.length}</Text>
            </Text>
            <Pressable
              accessibilityLabel="부서 전체 대화"
              hitSlop={10}
              style={{ marginLeft: 'auto' }}
              onPress={() => {
                const res = actions.startChat(current.members.map((u) => u.id), current.dept);
                if (res.ok) router.push({ pathname: '/room/[id]', params: { id: res.roomId! } });
              }}>
              <Icon name="chat" color={c.accent} size={22} />
            </Pressable>
          </View>
          {current.members.map((u) => <View key={u.id}>{renderMember(u)}</View>)}
        </>
      ) : groups.length ? (
        groups.map((g) => (
          <Pressable key={g.dept} onPress={() => onDept(g.dept)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, opacity: pressed ? 0.6 : 1 })}>
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="people" color={c.sub} size={20} />
            </View>
            <Text style={{ flex: 1, ...family.semibold, fontSize: 16, color: c.text }}>{g.dept}</Text>
            <Text style={{ ...family.regular, fontSize: 14, color: c.faint }}>{g.members.length}</Text>
            <Icon name="chevron" color={c.faint} size={16} />
          </Pressable>
        ))
      ) : (
        <Empty text="주소록에 표시할 사람이 없습니다." />
      )}
    </View>
  );
}

// 밑줄 탭 (조직도/외부 연락처, 전체/구성원/조직·그룹 등)
export function UnderlineTabs<K extends string>({ tabs, value, onChange, dots, scroll }: { tabs: [K, string][]; value: K; onChange: (k: K) => void; dots?: Partial<Record<K, boolean>>; scroll?: boolean }) {
  const c = useColors();
  const row = (
    <View style={{ flexDirection: 'row', borderBottomWidth: scroll ? 0 : 1, borderBottomColor: c.line }}>
      {tabs.map(([k, label]) => (
        <Pressable key={k} onPress={() => onChange(k)} style={{ paddingVertical: space.sm + 2, marginRight: space.xl, borderBottomWidth: 2.5, borderBottomColor: value === k ? c.accent : 'transparent', marginBottom: -1, flexDirection: 'row' }}>
          <Text style={{ ...(value === k ? family.bold : family.regular), fontSize: 15, color: value === k ? c.accent : c.sub }}>{label}</Text>
          {dots?.[k] ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent, marginLeft: 2, marginTop: 2 }} /> : null}
        </Pressable>
      ))}
    </View>
  );
  // 탭이 많으면 가로로 밀어 봅니다.
  if (!scroll) return row;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: c.line }}>
      {row}
    </ScrollView>
  );
}
