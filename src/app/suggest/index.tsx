import { useState } from 'react';

import { mySuggestions } from '@/core/suggestions';
import { actions } from '@/core/store';
import { Button, Empty, Input, Notice, Screen, Section } from '@/ui/kit';
import { SuggestionCard } from '@/ui/suggestion';
import { useApp, useMe } from '@/ui/use-app';

// 라잇나우 건의사항: 누구나 쓰고, 내가 쓴 건의의 처리 상태와 답변을 봅니다.
export default function SuggestScreen() {
  const s = useApp();
  const user = useMe();
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState<{ tone: 'warn' | 'accent'; text: string }>();
  const mine = mySuggestions(s.suggestions, user.id);
  const submit = () => {
    const r = actions.submitSuggestion(body);
    setMsg(r.ok ? { tone: 'accent', text: '건의가 접수되었습니다.' } : { tone: 'warn', text: r.reason });
    if (r.ok) setBody('');
  };
  return (
    <Screen title="건의사항" back>
      <Input label="건의 내용" value={body} onChangeText={setBody} multiline style={{ minHeight: 120, textAlignVertical: 'top' }} />
      {msg ? <Notice tone={msg.tone} text={msg.text} /> : null}
      <Button label="보내기" onPress={submit} />
      <Section title={`내 건의 ${mine.length}`}>
        {mine.length ? mine.map((x) => <SuggestionCard key={x.id} s={x} />) : <Empty text="보낸 건의가 없습니다." />}
      </Section>
    </Screen>
  );
}
