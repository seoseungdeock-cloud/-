import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { canSeeWorkTab, canUseAgents } from '@/core/rooms';
import { useAx, type R } from '@/ui/axiom';
import { Icon, type IconName } from '@/ui/icons';
import { Badge, Empty, Screen } from '@/ui/kit';
import { Appear, Press } from '@/ui/motion';
import { family, font, radius, space, tracking, useColors } from '@/ui/theme';
import { useMe } from '@/ui/use-app';
import { useLayout } from '@/ui/web-frame';

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

/** 대제목 */
function Title({ text, index }: { text: string; index: number }) {
  const c = useColors();
  return (
    <Appear index={index}>
      <Text style={{ ...family.bold, fontSize: font.h3 + 1, color: c.text, letterSpacing: tracking.h3, marginTop: space.xl + 4, marginBottom: space.xs }}>{text}</Text>
    </Appear>
  );
}
/** 묶음: 작은 제목 + 타일(두 칸씩) */
function Group({ text, children }: { text: string; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ marginTop: space.md }}>
      <Text style={{ ...family.semibold, fontSize: font.tiny + 0.5, color: c.faint, marginBottom: space.sm, marginLeft: 2 }}>{text}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm + 2 }}>{children}</View>
    </View>
  );
}
/** 타일: 남색 아이콘 칸 + 제목. 누르면 살짝 눌리고 PC 에서 마우스를 올리면 떠오릅니다. */
function Item({ title, icon, right, onPress, index }: { title: string; icon: IconName; right?: ReactNode; onPress: () => void; index: number }) {
  const c = useColors();
  const { desktop } = useLayout();
  return (
    <Appear index={index} style={{ width: desktop ? 220 : '48%', flexGrow: desktop ? 0 : 1 }}>
      <Press onPress={onPress} lift scale={0.97} style={({ hovered }) => ({ gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: hovered ? c.lineStrong : c.surface, minHeight: 112, justifyContent: 'space-between' })}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.navBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} color={c.navText} size={20} />
          </View>
          <View style={{ marginLeft: 'auto' }}>{right}</View>
        </View>
        <Text style={{ ...family.semibold, fontSize: font.body, color: c.text, letterSpacing: -0.2 }}>{title}</Text>
      </Press>
    </Appear>
  );
}
function ManageSection({ allowed }: { allowed: boolean }) {
  const s = useAx<R>('status').data;
  let n = 0;
  return (
    <>
      <Title text="경영관리" index={0} />
      {MANAGE.map((g) => (
        <Group key={g.group} text={g.group}>
          {g.items
            .filter((m) => allowed || !m.gated)
            .map((m) => (
              <Item key={m.title} index={++n} title={m.title} icon={m.icon} right={m.pending && s?.pending ? <Badge label={`${s.pending}`} /> : undefined} onPress={() => router.push(m.href)} />
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
          <Title text="관리" index={12} />
          <Group text="계정·운영">
            <Item index={13} title="백오피스" icon="lock" onPress={() => router.push('/backoffice')} />
          </Group>
        </>
      ) : null}
    </Screen>
  );
}
