import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { canSeeWorkTab, canUseAgents } from '@/core/rooms';
import { useAx, type R } from '@/ui/axiom';
import { Icon, type IconName } from '@/ui/icons';
import { Badge, Empty, Screen } from '@/ui/kit';
import { family, radius, space, useColors } from '@/ui/theme';
import { useMe } from '@/ui/use-app';

// 경영관리 (AXIOM + 예전 경영 에이전트를 하나로). 의견 받기는 경영위원회(비판·옹호·판정, 예측 원장 성적)로,
// 프로그램 만들기는 작업지시(개발 팀)로, 마케팅 지휘실은 마케팅팀 작업지시로 합쳤습니다.
// 대제목(경영관리·관리) 아래 소제목 묶음(결재·판단 / 실행 / 자료·설정)으로 나눠 보입니다.
type Item = { href: Href; title: string; icon: IconName; gated?: boolean; pending?: boolean };
const MANAGE: { group: string; items: Item[] }[] = [
  {
    group: '결재·판단',
    items: [
      { href: '/axiom', title: '결재함', icon: 'check', pending: true },
      { href: '/axiom/council', title: '경영위원회', icon: 'people' },
      { href: '/axiom/ledger', title: '예측 원장', icon: 'board' },
    ],
  },
  {
    group: '실행',
    items: [
      { href: '/axiom/work', title: '작업지시', icon: 'case' },
      { href: { pathname: '/axiom/work', params: { team: 'marketing' } }, title: '마케팅팀', icon: 'notice' },
      { href: '/agent/meeting', title: '회의 정리', icon: 'chat', gated: true },
      { href: '/agent/images', title: '자료 이미지', icon: 'image', gated: true },
    ],
  },
  {
    group: '자료·설정',
    items: [
      { href: '/axiom/doc', title: '저장소', icon: 'file' },
      { href: '/axiom/agent', title: '에이전트', icon: 'spark' },
      { href: '/axiom/settings', title: '설정', icon: 'menu' },
    ],
  },
];

/** 대제목: 굵은 글씨 + 왼쪽 빨간 막대 */
function Title({ text }: { text: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xl, marginBottom: space.xs }}>
      <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: c.accent }} />
      <Text style={{ ...family.bold, fontSize: 19, color: c.text }}>{text}</Text>
    </View>
  );
}

/** 소제목: 작은 회색 글씨 + 위 구분선 */
function Group({ text, children }: { text: string; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ marginTop: space.md }}>
      <Text style={{ ...family.semibold, fontSize: 12, color: c.sub, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: c.line }}>{text}</Text>
      {children}
    </View>
  );
}

function Item({ title, icon, right, onPress }: { title: string; icon: IconName; right?: ReactNode; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 9, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 32, height: 32, borderRadius: radius.sm, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} color={c.accent} size={18} />
      </View>
      <Text style={{ flex: 1, ...family.semibold, fontSize: 14, color: c.text }}>{title}</Text>
      {right}
      <Icon name="chevron" color={c.faint} size={16} />
    </Pressable>
  );
}

function ManageSection({ allowed }: { allowed: boolean }) {
  const s = useAx<R>('status').data;
  return (
    <>
      <Title text="경영관리" />
      {MANAGE.map((g) => (
        <Group key={g.group} text={g.group}>
          {g.items
            .filter((m) => allowed || !m.gated)
            .map((m) => (
              <Item key={m.title} title={m.title} icon={m.icon} right={m.pending && s?.pending ? <Badge label={`${s.pending}`} /> : undefined} onPress={() => router.push(m.href)} />
            ))}
        </Group>
      ))}
    </>
  );
}

export default function WorkScreen() {
  const user = useMe();
  if (!canSeeWorkTab(user)) return <Screen title="업무"><Empty text="어드민 계정만 쓸 수 있습니다." /></Screen>;
  const allowed = canUseAgents(user);
  return (
    <Screen title="업무">
      <ManageSection allowed={allowed} />
      {user.role === 'admin' ? (
        <>
          <Title text="관리" />
          <Group text="계정·운영">
            <Item title="백오피스" icon="lock" onPress={() => router.push('/backoffice')} />
          </Group>
        </>
      ) : null}
    </Screen>
  );
}
