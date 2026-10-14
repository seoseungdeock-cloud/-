import { router } from 'expo-router';
import { View } from 'react-native';

import { Badge, Button, Card, Empty, ModeBadge, Screen, Section, Sub, T } from '@/ui/kit';
import { space } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

export default function CasesScreen() {
  const s = useApp();
  const user = useMe();
  const mine = s.rooms.filter((r) => r.memberIds.includes(user.id));
  const cases = mine.filter((r) => r.kind === 'case');
  const consults = mine.filter((r) => r.kind === 'consult');
  const open = (id: string) => router.push({ pathname: '/room/[id]', params: { id } });
  return (
    <Screen title="사건">
      <Section title="진행 중인 사건">
        {cases.length ? (
          cases.map((r) => {
            const ci = r.caseInfo!;
            const next = [...ci.deadlines].sort((a, b) => a.date.localeCompare(b.date))[0];
            return (
              <Card key={r.id} onPress={() => open(r.id)}>
                <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.xs }}>
                  <Badge label={ci.stage} />
                  <ModeBadge mode={r.mode} />
                </View>
                <T size="h2" bold>{ci.title}</T>
                <Sub>{ci.field}{next ? ` · 다음 기일 ${next.date} ${next.label}` : ''}</Sub>
              </Card>
            );
          })
        ) : (
          <Empty text="아직 사건이 없습니다." />
        )}
      </Section>
      <Section title="상담">
        {consults.length ? (
          consults.map((r) => (
            <Card key={r.id} onPress={() => open(r.id)}>
              <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.xs }}>
                <Badge label="상담" tone="plain" />
                <ModeBadge mode={r.mode} />
              </View>
              <T bold>{r.title}</T>
            </Card>
          ))
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
