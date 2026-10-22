import { router } from 'expo-router';
import { useState } from 'react';

import { defaultMode, ROOM_KIND_LABEL } from '@/core/rooms';
import { actions } from '@/core/store';
import type { RoomKind, RoomMode } from '@/core/types';
import { Button, Chip, Chips, Input, Notice, Screen, Section } from '@/ui/kit';
import { useApp, useMe } from '@/ui/use-app';

const KINDS: RoomKind[] = ['direct', 'group', 'stranger', 'office', 'meeting', 'marketing'];

export default function CreateRoomScreen() {
  const s = useApp();
  const user = useMe();
  const [kind, setKind] = useState<RoomKind>('direct');
  const [mode, setMode] = useState<RoomMode>('private');
  const [title, setTitle] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const others = s.users.filter((u) => u.id !== user.id);

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
    <Screen title="방 만들기" back>
      <Section title="종류">
        <Chips>
          {KINDS.map((k) => (
            <Chip key={k} label={ROOM_KIND_LABEL[k]} active={kind === k} onPress={() => pickKind(k)} />
          ))}
        </Chips>
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
