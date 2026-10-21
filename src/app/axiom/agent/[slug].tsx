import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AgentGate } from '@/ui/agent-gate';
import { AxScreen, useAx, useInstance, when, type R } from '@/ui/axiom';
import { Badge, Button, Card, Row, Section, Sub, T } from '@/ui/kit';
import { space } from '@/ui/theme';
import { useMe } from '@/ui/use-app';

export default function AxAgent() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const me = useMe();
  const inst = useInstance();
  const { data: a, error } = useAx<R>('agents.get', { slug });
  const convs = useAx<R[]>('conversations.list', { agent: slug }).data;
  const vers = useAx<R[]>('agents.versions', { slug }).data;
  const [showVers, setShowVers] = useState(false);
  const canEdit = a && (a.origin !== 'engine' || me.superAdmin);
  return (
    <AgentGate title="에이전트">
      <AxScreen title={a?.name ?? '에이전트'} error={error} loading={!a}>
        {a ? (
          <>
            <View
              style={{
                flexDirection: 'row',
                gap: space.xs,
                flexWrap: 'wrap',
                marginBottom: space.md,
              }}
            >
              <Badge label={a.origin === 'engine' ? '엔진 기본' : '조직 제작'} tone="plain" />
              <Badge label={`v${a.current_version}`} tone="plain" />
              <Badge label={a.v.model} tone="plain" />
              {a.archived ? <Badge label="보관됨" tone="warn" /> : null}
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
              <Button
                label="대화하기"
                onPress={() =>
                  router.push({
                    pathname: '/axiom/agent/chat',
                    params: { slug },
                  })
                }
              />
              {canEdit ? (
                <Button
                  label="고치기"
                  kind="soft"
                  onPress={() =>
                    router.push({
                      pathname: '/axiom/agent/form',
                      params: { slug },
                    })
                  }
                />
              ) : null}
            </View>
            <Section title="사용 설명서">
              {(inst?.manual_fields ?? []).map((f: R) => (
                <Card key={f.key}>
                  <T size="small" bold>
                    {f.label}
                  </T>
                  <T size="small">{a.v.manual?.[f.key] || '-'}</T>
                </Card>
              ))}
            </Section>
            {Object.keys(a.v.modes || {}).length ? (
              <Section title="실행 방식">
                {Object.entries(a.v.modes as Record<string, R>).map(([k, m]) => (
                  <Sub key={k}>
                    · {k}
                    {m.json ? ' (정해진 형식)' : ''}
                  </Sub>
                ))}
              </Section>
            ) : null}
            <Section title="최근 대화">
              {convs?.length ? (
                convs.slice(0, 10).map((c) => (
                  <Row
                    key={c.id}
                    title={c.title || '대화'}
                    sub={`${c.user_name || ''} · ${when(c.updated_at)} · ${c.visibility_label}`}
                    onPress={() =>
                      router.push({
                        pathname: '/axiom/agent/chat',
                        params: { slug, c: c.id },
                      })
                    }
                  />
                ))
              ) : (
                <Sub>아직 없음</Sub>
              )}
            </Section>
            <Section title="버전" right={<Button label={showVers ? '접기' : '보기'} kind="ghost" small onPress={() => setShowVers((v) => !v)} />}>
              {showVers
                ? (vers ?? []).map((v) => (
                    <Sub key={v.version}>
                      v{v.version} · {when(v.created_at)} · {v.change_note || ''}
                    </Sub>
                  ))
                : null}
            </Section>
          </>
        ) : null}
      </AxScreen>
    </AgentGate>
  );
}
