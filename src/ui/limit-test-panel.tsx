// 백오피스 '불변기간 알림 시험': '[테스트]' 가짜 사건을 만들고, 불변기간 알림을 지금 바로 보내 어떻게 오는지 봅니다.
import { useState } from 'react';
import { View } from 'react-native';

import { limitStatus, limitWhen, type LimitSlot } from '@/core/deadlines';
import { actions, deadlineCases, TEST_PREFIX } from '@/core/store';
import { Badge, Button, Card, Notice, Sub, T } from '@/ui/kit';
import { space } from '@/ui/theme';
import { useApp } from '@/ui/use-app';

const SLOTS: { key: LimitSlot; label: string }[] = [
  { key: 'd3', label: '3일 전 알림' },
  { key: 'd0', label: '만료일 경고 글' },
  { key: 'over', label: '도과 알림' },
  { key: 'digest', label: '아침 알림' },
];

export function LimitTestSection({ report }: { report: (r: { ok: boolean; reason?: string }, okText: string) => void }) {
  const s = useApp();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ title: string; body: string; recipients: number }>();
  const cases = deadlineCases(s).filter((k) => k.title.startsWith(TEST_PREFIX));
  const run = async (fn: () => Promise<{ ok: boolean; reason?: string }>, okText: string) => {
    setBusy(true);
    try {
      report(await fn(), okText);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginTop: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
        {cases.length ? (
          <Button label="가짜 사건 모두 지우기" kind="ghost" disabled={busy} onPress={() => { setSent(undefined); void run(actions.clearTestLimits, '가짜 사건을 모두 지웠습니다.'); }} />
        ) : (
          <Button label="가짜 사건 만들기" disabled={busy} onPress={() => void run(actions.seedTestLimits, '가짜 사건 3개를 만들었습니다. 아래에서 알림을 보내 보세요.')} />
        )}
      </View>
      {sent ? (
        <Card>
          <Sub>보낸 알림 · {sent.recipients}명</Sub>
          <T bold>{sent.title}</T>
          <Sub>{sent.body}</Sub>
        </Card>
      ) : null}
      {cases.map((k) => (
        <Card key={k.roomId}>
          <T bold>[{k.office}] {k.title}</T>
          {k.limits.map((d) => (
            <View key={d.id} style={{ marginTop: space.sm, gap: space.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Badge fixed label={limitStatus(d).label} tone={limitStatus(d).tone} />
                <Sub>{d.label} · {limitWhen(d)}</Sub>
              </View>
              <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
                {SLOTS.map((slot) => (
                  <Button
                    key={slot.key}
                    label={slot.label}
                    kind="soft"
                    small
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        const r = await actions.fireTestLimit(d.id, slot.key);
                        if (r.ok) setSent(r);
                        return r;
                      }, `${d.label} ${slot.label}을 보냈습니다.${slot.key === 'd0' ? ' 게시판 불변기간 탭에도 글이 올라갔습니다.' : ''}`)
                    }
                  />
                ))}
              </View>
            </View>
          ))}
        </Card>
      ))}
      {!cases.length ? <Sub>가짜 사건이 없습니다.</Sub> : null}
    </View>
  );
}
