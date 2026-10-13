import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { allowedModes, defaultMode, ROOM_KIND_LABEL, ROOM_MODE_INFO } from '@/core/rooms';
import { actions } from '@/core/store';
import type { RoomKind, RoomMode } from '@/core/types';
import { Button, Chip, Chips, Input, ModeBanner, Notice, Screen, Section, Sub } from '@/ui/kit';
import { space } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

const KINDS: RoomKind[] = ['direct', 'group', 'stranger', 'office', 'meeting', 'marketing'];

export default function NewRoomScreen() {
  const s = useApp();
  const user = useMe();
  const [kind, setKind] = useState<RoomKind>('direct');
  const [mode, setMode] = useState<RoomMode>('e2ee');
  const [title, setTitle] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const others = s.users.filter((u) => u.id !== user.id);
  const modes = allowedModes(kind);

  const pickKind = (k: RoomKind) => {
    setKind(k);
    setMode(defaultMode(k));
    setError(undefined);
  };
  const toggle = (id: string) => setMembers((m) => (kind === 'direct' ? [id] : m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  const create = () => {
    const res = actions.createRoom({ kind, mode, title, memberIds: kind === 'stranger' ? [] : members });
    if (!res.ok) return setError(res.reason);
    router.replace({ pathname: '/room/[id]', params: { id: res.roomId! } });
  };

  return (
    <Screen title="새 대화" back>
      <Section title="종류">
        <Chips>
          {KINDS.map((k) => (
            <Chip key={k} label={ROOM_KIND_LABEL[k]} active={kind === k} onPress={() => pickKind(k)} />
          ))}
        </Chips>
        {kind === 'stranger' ? <Sub>닉네임으로 새로운 사람과 대화합니다. 성인인증이 필요합니다.</Sub> : null}
      </Section>
      <Section title="보안 방식">
        <Sub>만든 뒤에는 바꿀 수 없고, 방 안에서 항상 표시됩니다.</Sub>
        <View style={{ height: space.sm }} />
        <Chips>
          {(['e2ee', 'ai'] as RoomMode[]).map((m) => (
            <Chip key={m} label={ROOM_MODE_INFO[m].label + (modes.includes(m) ? '' : ' (불가)')} active={mode === m} onPress={() => modes.includes(m) && setMode(m)} />
          ))}
        </Chips>
        <ModeBanner mode={mode} />
      </Section>
      {kind !== 'stranger' ? (
        <Section title="참여자">
          <Chips>
            {others.map((u) => (
              <Chip key={u.id} label={u.nickname} active={members.includes(u.id)} onPress={() => toggle(u.id)} />
            ))}
          </Chips>
        </Section>
      ) : null}
      <Section title="방 이름">
        <Input placeholder="비워 두면 참여자 이름으로" value={title} onChangeText={setTitle} />
      </Section>
      {error ? <Notice text={error} /> : null}
      <Button label="만들기" onPress={create} />
    </Screen>
  );
}
