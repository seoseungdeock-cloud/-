import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { aiAnswerLevel } from '@/core/rooms';
import { ApprovalCard, AxScreen, Markdown, RunList, useAx, useAxAction, type R } from '@/ui/axiom';
import { Badge, Button, Card, Chip, Chips, Input, Notice, Section, Sub, T } from '@/ui/kit';
import { space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

export default function AxCouncil() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const me = useMe();
  const { data: cn, error, reload } = useAx<R>('councils.get', { id }, { poll: (d) => (d.status === 'running' ? 2500 : false) });
  const ap = useAx<R>('approvals.get', { id: cn?.pending_approval_id }, { skip: !cn?.pending_approval_id });
  const act = useAxAction();
  const [note, setNote] = useState('');
  const [from, setFrom] = useState('forecast');
  const [showRuns, setShowRuns] = useState(false);
  const [meeting, setMeeting] = useState('');
  const { rooms, users } = useApp();
  // 연결할 수 있는 방: 내가 들어가 있고 의뢰인이 없는 방 (사건방·상담방 제외)
  const linkable = me.role === 'admin' ? rooms.filter((r) => r.memberIds.includes(me.id) && aiAnswerLevel(r, r.memberIds.map((id) => users.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u)) !== 'none') : [];

  const stepIdx = cn ? cn.steps.findIndex((s: R) => s.key === cn.step) : -1;
  const done = cn && cn.status !== 'running' && cn.status !== 'failed' && cn.status !== 'cancelled';
  const after = async (p: Promise<unknown>) => {
    if (await p) void reload();
  };

  return (
    <>
      <AxScreen title={cn?.title ?? '경영위원회'} error={error} loading={!cn}>
        {cn ? (
          <>
            <View
              style={{
                flexDirection: 'row',
                gap: space.xs,
                flexWrap: 'wrap',
                marginBottom: space.md,
              }}
            >
              <Badge label={cn.status_label} tone={cn.status === 'running' ? 'ai' : cn.status === 'awaiting_approval' ? 'accent' : 'plain'} />
              <Badge label={cn.visibility_label} tone="plain" />
              {cn.round > 1 ? <Badge label={`${cn.round}차 종합분석`} tone="plain" /> : null}
              {cn.room_title ? <Badge label={`대화방: ${cn.room_title}`} tone="plain" /> : null}
            </View>
            {cn.status === 'failed' ? <Notice text={`멈춤: ${cn.error || ''}`} /> : null}
            {cn.warnings?.map((w: string) => (
              <Notice key={w} text={w} />
            ))}
            <Card>
              {cn.steps.map((s: R, i: number) => {
                const state = done || i < stepIdx ? 'done' : i === stepIdx ? cn.status : 'wait';
                return (
                  <View
                    key={s.key}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.sm,
                      paddingVertical: 3,
                    }}
                  >
                    <T size="small" color={state === 'done' ? c.text : state === 'running' ? c.ai : state === 'wait' ? c.faint : c.warn}>
                      {state === 'done' ? '✓' : state === 'running' ? '●' : state === 'wait' ? '○' : '!'} {i + 1}. {s.label}
                    </T>
                  </View>
                );
              })}
            </Card>
            {ap.data && ap.data.status === 'pending' ? <ApprovalCard a={ap.data} onDone={() => void reload()} /> : null}
            {cn.status === 'approved' ? (
              <Button
                label="작업지시 보기"
                kind="soft"
                onPress={() =>
                  router.push({
                    pathname: '/axiom/work',
                    params: { council: cn.id },
                  })
                }
              />
            ) : null}
            {cn.record_doc_id && me.role === 'admin' ? (
              <View style={{ marginTop: space.sm }}>
                <Button
                  label="기록 문서 열기"
                  kind="ghost"
                  small
                  onPress={() =>
                    router.push({
                      pathname: '/axiom/doc/[id]',
                      params: { id: cn.record_doc_id },
                    })
                  }
                />
              </View>
            ) : null}
            <Section title="회의 기록">
              <Markdown text={cn.record_md} />
            </Section>
            {cn.can_act && cn.status !== 'running' ? (
              <Section title="새 회의록 넣기">
                <Input multiline value={meeting} onChangeText={setMeeting} placeholder={'이름: 발언\n이름: 발언'} />
                <Button
                  label="이전 분석과 함께 종합분석"
                  small
                  disabled={act.busy || meeting.trim().length < 20}
                  onPress={() => void after(act.run('councils.addMeeting', { id, meeting_text: meeting }).then((r) => (r && setMeeting(''), r)))}
                />
              </Section>
            ) : null}
            {cn.data_gaps?.length ? (
              <Section title="부족한 자료">
                {cn.data_gaps.map((g: string) => (
                  <GapRow key={g} gap={g} busy={act.busy} onSend={(text) => after(act.run('councils.supply', { id, gap: g, text }))} />
                ))}
              </Section>
            ) : null}
            <Section title="개입">
              {cn.interventions?.map((x: R, i: number) => (
                <Sub key={i}>
                  · {x.user_name || ''}: {x.text}
                </Sub>
              ))}
              <Input multiline value={note} onChangeText={setNote} placeholder="위원회에 넣을 지시" />
              {act.error ? <Notice text={act.error} /> : null}
              <View
                style={{
                  flexDirection: 'row',
                  gap: space.sm,
                  flexWrap: 'wrap',
                }}
              >
                <Button
                  label="지시 넣기"
                  small
                  disabled={!note.trim() || act.busy}
                  onPress={() => void after(act.run('councils.intervene', { id, text: note }).then((r) => (r && setNote(''), r)))}
                />
                {cn.status === 'running' ? (
                  <Button label="진행 중단" kind="ghost" small disabled={act.busy} onPress={() => void after(act.run('councils.cancel', { id }))} />
                ) : null}
              </View>
              {cn.can_rerun && cn.status !== 'running' ? (
                <View style={{ marginTop: space.md }}>
                  <Sub>다시 실행할 단계</Sub>
                  <View style={{ height: space.xs }} />
                  <Chips>
                    {cn.steps.map((s: R) => (
                      <Chip key={s.key} label={s.label} active={from === s.key} onPress={() => setFrom(s.key)} />
                    ))}
                  </Chips>
                  <Button label="이 단계부터 다시 실행" kind="soft" small disabled={act.busy} onPress={() => void after(act.run('councils.rerun', { id, from_step: from }))} />
                </View>
              ) : null}
            </Section>
            {me.role === 'admin' ? (
              <Section title="대화방 연결">
                <Chips>
                  <Chip label="연결 안 함" active={!cn.room_id} onPress={() => void after(act.run('councils.link', { id, room_id: null }))} />
                  {linkable.map((r) => (
                    <Chip key={r.id} label={r.title} active={cn.room_id === r.id} onPress={() => void after(act.run('councils.link', { id, room_id: r.id }))} />
                  ))}
                </Chips>
              </Section>
            ) : null}
            <Section title="실행 기록" right={<Button label={showRuns ? '접기' : `${cn.runs?.length ?? 0}건 보기`} kind="ghost" small onPress={() => setShowRuns((v) => !v)} />}>
              {showRuns ? <RunList runs={cn.runs} /> : null}
            </Section>
          </>
        ) : null}
      </AxScreen>
    </>
  );
}

/** 부족한 자료 한 줄: 넣으면 그 자리에서 예측 단계부터 다시 계산합니다 */
function GapRow({ gap, busy, onSend }: { gap: string; busy: boolean; onSend: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  return (
    <View style={{ marginBottom: space.md }}>
      <T bold size="small">{gap}</T>
      <Input multiline value={text} onChangeText={setText} placeholder="예: 9월 매출 12억, 형사 3억" />
      <Button label="자료 넣기" small disabled={busy || !text.trim()} onPress={() => void onSend(text.trim())} />
    </View>
  );
}
