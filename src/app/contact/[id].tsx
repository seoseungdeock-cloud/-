import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { contactsFor } from '@/core/contacts';
import { displayName, externalContacts, presenceOf } from '@/core/messenger';
import { actions } from '@/core/store';
import type { User } from '@/core/types';
import { Icon, type IconName } from '@/ui/icons';
import { Avatar, Button, Empty, Input, Screen } from '@/ui/kit';
import { usePresenceBadge } from '@/ui/presence';
import { family, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

const ROLE_LABEL = { client: '의뢰인', lawyer: '변호사', staff: '직원', admin: '어드민' } as const;

function birthdayText(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}. ${m}. ${d}.`;
}

// 연락처 상세 (웍스 구성: 메시지·전화·메일 바로가기, 소속, 전화, 메일, 생일, 입사일)
export default function ContactScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useApp();
  const me = useMe();
  const c = useColors();
  const dot = usePresenceBadge();
  const u = s.users.find((x) => x.id === id);
  // 주소록에서 볼 수 있는 사람만 (자기 자신 포함)
  const visible = u && (u.id === me.id || contactsFor(me, s).some((x) => x.id === u.id) || externalContacts(me, s.users, s.rooms).some((x) => x.id === u.id));
  if (!u || !visible) return <Screen title="연락처 상세" back><Empty text="연락처를 찾을 수 없습니다." /></Screen>;
  const fav = (s.favorites[me.id] ?? []).includes(u.id);
  // 의뢰인끼리는 서로의 전화·메일을 보지 않습니다.
  const showPrivate = me.role !== 'client' || u.id === me.id;

  const actionsRow: { icon: IconName; label: string; onPress?: () => void }[] = [
    { icon: 'chat', label: '메시지', onPress: u.id === me.id ? undefined : () => router.push({ pathname: '/room/[id]', params: { id: actions.openDirect(u.id) } }) },
    { icon: 'phone', label: '전화', onPress: showPrivate && u.phone ? () => Linking.openURL(`tel:${u.phone}`) : undefined },
    { icon: 'mail', label: '메일', onPress: showPrivate && u.email ? () => Linking.openURL(`mailto:${u.email}`) : undefined },
  ];
  const rows: [string, string | undefined][] = [
    ['직급', u.officer ? `${u.title ?? ''} · 임원`.replace(/^ · /, '') : u.title],
    ['직책', u.duty],
    ['겸직', u.extraDepts?.join(', ')],
    ['직군', u.job && u.job !== u.title ? u.job : undefined],
    ['전화', showPrivate ? u.phone : undefined],
    ['메일', showPrivate ? u.email : undefined],
    ['생일', showPrivate && u.birthday ? birthdayText(u.birthday) : undefined],
    ['입사일', u.joinedAt ? birthdayText(u.joinedAt) : undefined],
  ];

  return (
    <Screen title="연락처 상세" back>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: space.md }}>
        <Avatar name={u.nickname} size={88} uri={u.photo} badge={u.role === 'client' ? undefined : dot(u)} />
        <View style={{ flex: 1 }}>
          <Text style={{ ...family.bold, fontSize: 22, color: c.text }}>{displayName(u)}</Text>
          <Text style={{ ...family.regular, fontSize: 14, color: c.sub, marginTop: 2 }}>
            {ROLE_LABEL[u.role]}
            {u.role !== 'client' ? ` · ${presenceOf(u).label}` : ''}
          </Text>
          {u.status ? <Text style={{ ...family.regular, fontSize: 14, color: c.text, marginTop: 4 }}>{u.status}</Text> : null}
        </View>
        {u.id === me.id ? (
          <Pressable accessibilityLabel="프로필 편집" onPress={() => router.push('/profile')} hitSlop={10}>
            <Text style={{ ...family.semibold, fontSize: 15, color: c.accent }}>편집</Text>
          </Pressable>
        ) : u.id !== me.id ? (
          <Pressable accessibilityLabel={fav ? '즐겨찾기 해제' : '즐겨찾기'} onPress={() => actions.toggleFavorite(u.id)} hitSlop={10}>
            <Icon name="star" color={fav ? c.accent : c.faint} size={28} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: space.xl, borderBottomWidth: 1, borderBottomColor: c.line }}>
        {actionsRow.map((a) => (
          <Pressable key={a.label} disabled={!a.onPress} onPress={a.onPress} style={{ alignItems: 'center', gap: space.xs, opacity: a.onPress ? 1 : 0.35 }}>
            <Icon name={a.icon} color={c.accent} size={26} />
            <Text style={{ ...family.semibold, fontSize: 14, color: c.accent }}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      {u.firm ? (
        <View style={{ paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: c.line, gap: space.md }}>
          <Text style={{ ...family.regular, fontSize: 13, color: c.faint }}>법무법인 {u.firm}</Text>
          {[u.branch, u.dept].filter((v, i, a) => v && a.indexOf(v) === i).map((v) => (
            <Text key={v} style={{ ...family.semibold, fontSize: 17, color: c.text }}>{v}</Text>
          ))}
        </View>
      ) : null}

      {me.role === 'admin' && u.role !== 'client' ? <ExtraDeptsEditor u={u} /> : null}
      {rows.filter(([, v]) => v).map(([label, v]) => (
        <View key={label} style={{ paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: c.line, gap: space.xs }}>
          <Text style={{ ...family.regular, fontSize: 13, color: c.faint }}>{label}</Text>
          <Text style={{ ...family.regular, fontSize: 17, color: c.text }}>{v}</Text>
        </View>
      ))}
    </Screen>
  );
}

/** 어드민: 겸직 부서 넣기 (쉼표로 여러 개) */
function ExtraDeptsEditor({ u }: { u: User }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(u.extraDepts?.join(', ') ?? '');
  const [err, setErr] = useState<string>();
  if (!open) return <Pressable onPress={() => setOpen(true)} style={{ paddingVertical: space.sm }}><Text style={{ ...family.semibold, fontSize: 13, color: c.accent }}>겸직 부서 {u.extraDepts?.length ? '고치기' : '넣기'} (어드민)</Text></Pressable>;
  return (
    <View style={{ paddingVertical: space.md, gap: space.sm, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <Input label="겸직 부서 — 쉼표로 여러 개 (조직도에서 그 부서에도 함께 보입니다)" value={v} onChangeText={setV} placeholder="예: 경영본부, 상담팀" />
      {err ? <Text style={{ ...family.regular, fontSize: 13, color: c.warn }}>{err}</Text> : null}
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}><Button label="취소" kind="plain" onPress={() => setOpen(false)} /></View>
        <View style={{ flex: 2 }}><Button label="저장" onPress={() => { const r = actions.setExtraDepts(u.id, v.split(',')); if (!r.ok) setErr(r.reason); else setOpen(false); }} /></View>
      </View>
    </View>
  );
}
