import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';

import { aiCanJoin, ROOM_KIND_LABEL } from '@/core/rooms';
import { actions } from '@/core/store';
import { AI_SENDER, SYSTEM_SENDER, type Message } from '@/core/types';
import { CasePanel } from '@/ui/case-panel';
import { Icon } from '@/ui/icons';
import { Button, Empty, Input, ModeBadge, ModeBanner, Notice, Screen, Sub, T } from '@/ui/kit';
import { family, font, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const room = s.rooms.find((r) => r.id === id);
  const messages = useMemo(() => s.messages.filter((m) => m.roomId === id), [s.messages, id]);
  const [text, setText] = useState('');
  const [promote, setPromote] = useState({ open: false, title: '', field: '', error: '' });
  const list = useRef<FlatList<Message>>(null);

  if (!room) return <Screen title="대화" back><Empty text="방을 찾을 수 없습니다." /></Screen>;
  const isMember = room.memberIds.includes(user.id);
  const names = room.memberIds.map((mid) => s.users.find((u) => u.id === mid)?.nickname ?? mid);

  const send = () => {
    if (!text.trim()) return;
    void actions.sendMessage(room.id, text);
    setText('');
  };

  const doPromote = () => {
    const res = actions.promoteToCase(room.id, promote.title, promote.field);
    setPromote((p) => ({ ...p, error: res.ok ? '' : res.reason, open: !res.ok }));
  };

  const header = (
    <View style={{ gap: space.sm, marginBottom: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <ModeBadge mode={room.mode} />
        <Sub>{ROOM_KIND_LABEL[room.kind]} · {names.join(', ')}</Sub>
      </View>
      <ModeBanner mode={room.mode} />
      {room.kind === 'case' ? <CasePanel room={room} canEdit={user.role !== 'client'} /> : null}
      {room.kind === 'consult' && user.role === 'lawyer' && isMember ? (
        promote.open ? (
          <View>
            <Input placeholder="사건명" value={promote.title} onChangeText={(v) => setPromote((p) => ({ ...p, title: v }))} />
            <Input placeholder="분야 (예: 이혼)" value={promote.field} onChangeText={(v) => setPromote((p) => ({ ...p, field: v }))} />
            {promote.error ? <Notice text={promote.error} /> : null}
            <Button label="수임하고 사건방으로 전환" onPress={doPromote} />
          </View>
        ) : (
          <Button label="수임 → 사건방으로 전환" kind="soft" onPress={() => setPromote((p) => ({ ...p, open: true }))} />
        )
      ) : null}
      {room.kind === 'meeting' ? <Button label="회의 정리·의견 화면 열기" kind="soft" onPress={() => router.push({ pathname: '/agent/meeting', params: { roomId: room.id } })} /> : null}
    </View>
  );

  return (
    <Screen title={room.title} back scroll={false}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => m.id}
          ListHeaderComponent={header}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => <Bubble m={item} mine={item.senderId === user.id} sender={s.users.find((u) => u.id === item.senderId)?.nickname} />}
        />
        {isMember ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingVertical: space.sm }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={aiCanJoin(room) ? '메시지 입력 · @AI 도움말' : '메시지 입력'}
              placeholderTextColor={c.faint}
              multiline
              onSubmitEditing={send}
              style={{ flex: 1, backgroundColor: c.surface, color: c.text, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md, fontSize: font.body, fontFamily: family.regular, maxHeight: 120 }}
            />
            <Pressable accessibilityLabel="보내기" onPress={send} style={{ backgroundColor: c.accent, borderRadius: 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="send" color="#FFFFFF" size={20} />
            </Pressable>
          </View>
        ) : (
          <Notice text="이 방의 참여자가 아닙니다." />
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Bubble({ m, mine, sender }: { m: Message; mine: boolean; sender?: string }) {
  const c = useColors();
  if (m.senderId === SYSTEM_SENDER) {
    return (
      <View style={{ alignItems: 'center', marginVertical: space.sm }}>
        <T size="tiny" color={c.faint} style={{ textAlign: 'center' }}>{m.text}</T>
      </View>
    );
  }
  const isAi = m.senderId === AI_SENDER;
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginVertical: space.xs }}>
      {!mine ? <T size="tiny" color={isAi ? c.ai : c.sub}>{isAi ? '✦ AI' : sender}</T> : null}
      <View
        style={{
          maxWidth: '82%',
          backgroundColor: mine ? c.bubbleMine : isAi ? c.aiSoft : c.bubbleOther,
          borderRadius: radius.lg,
          paddingHorizontal: space.md,
          paddingVertical: space.sm + 2,
          marginTop: 2,
        }}>
        <T color={mine ? c.bubbleMineText : c.text}>{m.text}</T>
      </View>
    </View>
  );
}
