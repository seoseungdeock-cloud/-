import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { actions } from '@/core/store';
import { AgentGate } from '@/ui/agent-gate';
import { Button, Card, Chip, Chips, Input, Notice, Screen, Section, Sub, T } from '@/ui/kit';
import { space } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

const SAMPLE = `승덕: 이번 분기 검색광고 예산을 20% 늘리기로 결정합니다.
변호사: 상속 분야 상담이 늘고 있습니다.
승덕: @사무국 다음 주까지 상속 안내 자료 준비해주세요.`;

export default function MeetingScreen() {
  const params = useLocalSearchParams<{ roomId?: string }>();
  const s = useApp();
  const user = useMe();
  const meetings = s.rooms.filter((r) => r.kind === 'meeting' && r.memberIds.includes(user.id));
  const [roomId, setRoomId] = useState(params.roomId ?? meetings[0]?.id);
  const room = s.rooms.find((r) => r.id === roomId);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string>();
  const notes = roomId ? s.meetingNotes[roomId] : undefined;

  const summarize = () => {
    if (!roomId) return;
    const res = actions.summarizeMeeting(roomId, transcript);
    setError(res.ok ? undefined : res.reason);
  };

  return (
    <AgentGate title="회의 정리">
      <Screen title="회의 정리" back>
        <Section title="회의방">
          <Chips>
            {meetings.map((m) => <Chip key={m.id} label={m.title} active={m.id === roomId} onPress={() => setRoomId(m.id)} />)}
          </Chips>
          {room ? <Button label="회의방 대화 열기" kind="ghost" small onPress={() => router.push({ pathname: '/room/[id]', params: { id: room.id } })} /> : null}
        </Section>
        <Section title="녹음">
          <View>
            <Button label={recording ? '녹음 중지' : '녹음 시작'} kind="soft" onPress={() => setRecording((r) => !r)} />
          </View>
        </Section>
        <Section title="회의록" right={<Button label="예시 넣기" kind="ghost" small onPress={() => setTranscript(SAMPLE)} />}>
          <Input multiline placeholder={'이름: 발언\n이름: 발언'} value={transcript} onChangeText={setTranscript} />
          {error ? <Notice text={error} /> : null}
          <Button label="정리해서 회의방에 올리기" onPress={summarize} disabled={!transcript.trim() || !roomId} />
        </Section>
        {notes ? (
          <Section title="정리 결과">
            <Card>
              {notes.summary.map((x) => <Sub key={x}>{x}</Sub>)}
              <T bold style={{ marginTop: space.sm }}>결정사항</T>
              {notes.decisions.length ? notes.decisions.map((d) => <T key={d}>· {d}</T>) : <Sub>없음</Sub>}
              <T bold style={{ marginTop: space.sm }}>할 일</T>
              {notes.actions.length ? notes.actions.map((a, i) => <T key={i}>· {a.owner ? `[${a.owner}] ` : ''}{a.task}{a.due ? ` (${a.due})` : ''}</T>) : <Sub>없음</Sub>}
            </Card>
          </Section>
        ) : null}
      </Screen>
    </AgentGate>
  );
}
