import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, Text, View } from 'react-native';

import { contactsFor } from '@/core/contacts';
import { displayName, externalContacts, presenceOf } from '@/core/messenger';
import { actions } from '@/core/store';
import { Icon, type IconName } from '@/ui/icons';
import { Avatar, Empty, Screen } from '@/ui/kit';
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
          {[u.dept, u.branch].filter((v, i, a) => v && a.indexOf(v) === i).map((v) => (
            <Text key={v} style={{ ...family.semibold, fontSize: 17, color: c.text }}>{v}</Text>
          ))}
        </View>
      ) : null}

      {rows.filter(([, v]) => v).map(([label, v]) => (
        <View key={label} style={{ paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: c.line, gap: space.xs }}>
          <Text style={{ ...family.regular, fontSize: 13, color: c.faint }}>{label}</Text>
          <Text style={{ ...family.regular, fontSize: 17, color: c.text }}>{v}</Text>
        </View>
      ))}
    </Screen>
  );
}
