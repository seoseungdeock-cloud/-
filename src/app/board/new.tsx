import { router } from 'expo-router';
import { useState } from 'react';

import { actions } from '@/core/store';
import home from '@/data/home.json';
import { Button, Chip, Chips, Input, Notice, Screen, Section } from '@/ui/kit';

export default function NewPostScreen() {
  const [field, setField] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string>();
  const submit = () => {
    const res = actions.createPost({ title, body, field });
    if (!res.ok) return setError(res.reason);
    router.replace({ pathname: '/board/[id]', params: { id: res.postId! } });
  };
  return (
    <Screen title="익명 글쓰기" back>
      <Section title="분야">
        <Chips>
          {home.fields.map((f) => <Chip key={f} label={f} active={field === f} onPress={() => setField(f)} />)}
        </Chips>
      </Section>
      <Input label="제목" value={title} onChangeText={setTitle} />
      <Input label="내용" value={body} onChangeText={setBody} multiline style={{ minHeight: 160, textAlignVertical: 'top' }} />
      {error ? <Notice tone="warn" text={error} /> : null}
      <Button label="익명으로 올리기" onPress={submit} />
    </Screen>
  );
}
