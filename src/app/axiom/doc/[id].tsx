import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AgentGate } from '@/ui/agent-gate';
import { AxScreen, linkOf, Markdown, useAx, when, type R } from '@/ui/axiom';
import { Badge, Button, Row, Section, Sub } from '@/ui/kit';
import { space } from '@/ui/theme';

/** 회사 상태 문서(JSON)는 표로 */
function bodyOf(d: R, text: string) {
  if (d.kind !== 'state') return text;
  try {
    const j = JSON.parse(text);
    const rows = (j.metrics ?? []).map((m: R) => `| ${m.name} | ${m.value ?? ''} | ${m.unit ?? ''} |`);
    return ['| 항목 | 값 | 단위 |', '|---|---|---|', ...rows, '', j.notes || ''].join('\n');
  } catch {
    return text;
  }
}

export default function AxDoc() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: d, error } = useAx<R>('docs.get', { id });
  const revs = useAx<R[]>('docs.revisions', { id }).data;
  const [rev, setRev] = useState<number>();
  const old = useAx<R>('docs.revision', { id, rev }, { skip: !rev }).data;
  const shown = rev && old ? old : d;
  const ref = d ? linkOf(d.ref_type, d.ref_id) : undefined;
  return (
    <AgentGate title="문서">
      <AxScreen title={shown?.title ?? '문서'} error={error} loading={!d}>
        {d && shown ? (
          <>
            <View
              style={{
                flexDirection: 'row',
                gap: space.xs,
                flexWrap: 'wrap',
                marginBottom: space.sm,
              }}
            >
              <Badge label={d.kind_label} tone="plain" />
              <Badge label={d.visibility_label} tone="plain" />
              <Badge label={rev ? `${rev}판 (예전)` : `${d.rev}판`} tone={rev ? 'warn' : 'plain'} />
            </View>
            <Sub>
              {d.author_name || ''} · {when(d.updated_at)}
            </Sub>
            <View
              style={{
                flexDirection: 'row',
                gap: space.sm,
                marginVertical: space.md,
                flexWrap: 'wrap',
              }}
            >
              {!rev ? (
                <Button label="고치기" kind="soft" small onPress={() => router.push({ pathname: '/axiom/doc/new', params: { id } })} />
              ) : (
                <Button label="최신판 보기" kind="soft" small onPress={() => setRev(undefined)} />
              )}
              {ref ? <Button label="관련 항목" kind="ghost" small onPress={ref} /> : null}
            </View>
            <Markdown text={bodyOf(d, shown.body)} />
            {revs && revs.length > 1 ? (
              <Section title="고친 이력">
                {revs.map((r) => (
                  <Row key={r.rev} title={`${r.rev}판 · ${r.title}`} sub={`${r.editor || '시스템'} · ${when(r.at)}`} onPress={() => setRev(r.rev === d.rev ? undefined : r.rev)} />
                ))}
              </Section>
            ) : null}
          </>
        ) : null}
      </AxScreen>
    </AgentGate>
  );
}
