import { router } from 'expo-router';
import { useState } from 'react';

import { OPEN_MAX_OPTIONS } from '@/core/open-chat';
import { actions } from '@/core/store';
import { Button, Chip, Chips, Input, Notice, Screen, Sub } from '@/ui/kit';

// 오픈대화방 만들기: 방 이름·소개·태그·최대 인원, 이 방에서 쓸 내 닉네임
export default function NewOpenRoomScreen() {
  const [form, setForm] = useState({ title: '', description: '', tags: '', max: 100, alias: '' });
  const [error, setError] = useState('');
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const create = () => {
    const r = actions.createOpenRoom(form);
    if (!r.ok) return setError(r.reason);
    router.replace({ pathname: '/open/[id]', params: { id: r.roomId! } });
  };
  return (
    <Screen title="오픈대화방 만들기" back>
      {error ? <Notice text={error} /> : null}
      <Input label="방 이름" value={form.title} onChangeText={set('title')} />
      <Input label="소개" value={form.description} onChangeText={set('description')} multiline />
      <Input label="태그" placeholder="이혼, 양육권" value={form.tags} onChangeText={set('tags')} />
      <Sub>최대 인원</Sub>
      <Chips>
        {OPEN_MAX_OPTIONS.map((n) => (
          <Chip key={n} label={`${n}명`} active={form.max === n} onPress={() => setForm((f) => ({ ...f, max: n }))} />
        ))}
      </Chips>
      <Input label="이 방에서 쓸 내 닉네임" value={form.alias} onChangeText={set('alias')} />
      <Button label="만들기" onPress={create} />
    </Screen>
  );
}
