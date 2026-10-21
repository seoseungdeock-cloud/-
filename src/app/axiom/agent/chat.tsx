import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AgentGate } from '@/ui/agent-gate';
import { AxScreen, Markdown, MockNotice, useAx, useAxAction, useInstance, VisibilityPicker, type R } from '@/ui/axiom';
import { Button, Card, enterToSend, Input, Notice, Sub } from '@/ui/kit';
import { radius, space, useColors } from '@/ui/theme';

type Msg = { id: string; role: string; content: string };

export default function AxChat() {
  const { slug, c } = useLocalSearchParams<{ slug: string; c?: string }>();
  const agent = useAx<R>('agents.get', { slug }).data;
  const conv = useAx<R>('conversations.get', { id: c }, { skip: !c });
  return (
    <AgentGate title="대화">
      <AxScreen title={agent?.name ?? '대화'} error={conv.error} loading={!agent || (!!c && !conv.data)}>
        <Chat slug={slug} convId0={c} initial={conv.data?.messages ?? []} />
      </AxScreen>
    </AgentGate>
  );
}

function Chat({ slug, convId0, initial }: { slug: string; convId0?: string; initial: Msg[] }) {
  const col = useColors();
  const inst = useInstance();
  const [convId, setConvId] = useState(convId0);
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState('');
  const [vis, setVis] = useState('org');
  const { run, busy, error } = useAxAction();

  const send = async () => {
    const message = text.trim();
    if (!message || busy) return;
    setText('');
    setMsgs((m) => [...m, { id: `u${Date.now()}`, role: 'user', content: message }]);
    const r = await run<R>('agents.chat', {
      slug,
      message,
      conversation_id: convId,
      visibility: convId ? undefined : vis,
    });
    if (r) {
      setConvId(r.conversation.id);
      setMsgs((m) => [...m, { id: r.run_id, role: 'assistant', content: String(r.reply) }]);
    }
  };

  return (
    <>
      <MockNotice />
      {!convId && inst ? <VisibilityPicker value={vis} onChange={setVis} teams={inst.teams} /> : null}
      {msgs.map((m) =>
        m.role === 'user' ? (
          <View
            key={m.id}
            style={{
              alignSelf: 'flex-end',
              maxWidth: '85%',
              backgroundColor: col.accentSoft,
              borderRadius: radius.md,
              padding: space.md,
              marginBottom: space.sm,
            }}
          >
            <Markdown text={m.content} />
          </View>
        ) : (
          <Card key={m.id}>
            <Markdown text={m.content} />
          </Card>
        ),
      )}
      {busy ? <Sub>답을 쓰는 중…</Sub> : null}
      {error ? <Notice text={error} /> : null}
      <View style={{ marginTop: space.md }}>
        <Input multiline placeholder="메시지" value={text} onChangeText={setText} {...enterToSend(() => void send())} />
        <Button label="보내기" disabled={busy || !text.trim()} onPress={() => void send()} />
      </View>
    </>
  );
}
