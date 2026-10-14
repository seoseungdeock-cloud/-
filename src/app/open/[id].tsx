import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { dayKey, markParts } from '@/core/messenger';
import { aliasOf, canManageOpen, canUseOpenChat, isLocked, isOpenMember } from '@/core/open-chat';
import { actions } from '@/core/store';
import type { OpenMessage, User } from '@/core/types';
import { DayDivider, Sheet } from '@/ui/chat';
import { Icon } from '@/ui/icons';
import { Button, Empty, enterToSend, Input, Notice, Screen } from '@/ui/kit';
import { OpenAvatar } from '@/ui/open-chat';
import { clockTime } from '@/ui/room-row';
import { family, font, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

type Item = OpenMessage | { id: string; day: string };

const ROLE: Record<User['role'], string> = { client: '의뢰인', lawyer: '변호사', staff: '직원', admin: '어드민' };

// 오픈대화방: 방마다 정한 닉네임만 보입니다 (실명·사진·직책·연락처는 보이지 않음).
export default function OpenRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const room = s.openRooms.find((r) => r.id === id);
  const [text, setText] = useState('');
  const [alias, setAlias] = useState('');
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState<string>();
  const [password, setPassword] = useState('');
  const [newPw, setNewPw] = useState('');
  const [watch, setWatch] = useState(false);
  const [done, setDone] = useState('');
  const list = useRef<FlatList<Item>>(null);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    let last = '';
    for (const m of s.openMessages.filter((x) => x.roomId === id)) {
      const k = dayKey(m.at);
      if (k !== last) out.push({ id: `__day_${k}`, day: m.at });
      last = k;
      out.push(m);
    }
    return out;
  }, [s.openMessages, id]);

  if (!room || !canUseOpenChat(user)) return <Screen title="오픈대화방" back><Empty text="방을 찾을 수 없습니다." /></Screen>;
  const member = isOpenMember(room, user.id);
  const isHost = room.hostId === user.id;
  // 관리자어드민만 닉네임 뒤의 실제 이용자를 봅니다.
  const manager = canManageOpen(user);
  const real = (uid: string) => {
    if (!manager) return undefined;
    const u = s.users.find((x) => x.id === uid);
    return u ? `${u.nickname} · ${u.title ?? ROLE[u.role]}` : undefined;
  };
  const query = search?.trim() ?? '';

  // 참여 전: 방 소개와 닉네임 정하기
  if (!member && !(manager && watch)) {
    const banned = room.banned.includes(user.id);
    return (
      <Screen title="오픈대화방" back>
        <View style={{ alignItems: 'center', gap: space.sm, marginVertical: space.xl }}>
          <OpenAvatar label={room.title} size={80} />
          <Text style={{ fontFamily: family.bold, fontSize: 22, color: c.text, textAlign: 'center' }}>{room.title}</Text>
          <Text style={{ fontFamily: family.regular, fontSize: 14, color: c.sub }}>
            {room.members.length}/{room.max}명{room.tags.length ? ` · ${room.tags.map((t) => `#${t}`).join(' ')}` : ''}
          </Text>
          {room.description ? <Text style={{ fontFamily: family.regular, fontSize: 15, color: c.text, textAlign: 'center' }}>{room.description}</Text> : null}
        </View>
        {error ? <Notice text={error} /> : null}
        {isLocked(room) && !banned ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: space.sm }}>
            <Icon name="lock" color={c.sub} size={16} />
            <Text style={{ fontFamily: family.semibold, fontSize: 14, color: c.sub }}>비밀번호 방</Text>
          </View>
        ) : null}
        {banned ? (
          <Notice text="방장이 내보낸 방에는 다시 들어갈 수 없습니다." />
        ) : (
          <>
            {isLocked(room) ? <Input label="비밀번호" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" /> : null}
            <Input label="이 방에서 쓸 닉네임" value={alias} onChangeText={setAlias} />
            <Button
              label="참여하기"
              onPress={() => {
                const r = actions.joinOpenRoom(room.id, alias, password);
                setError(r.ok ? '' : r.reason);
              }}
            />
          </>
        )}
        {manager ? <Button label="관리자로 보기" kind="soft" onPress={() => setWatch(true)} /> : null}
      </Screen>
    );
  }

  const send = () => {
    if (!text.trim()) return;
    actions.sendOpen(room.id, text);
    setText('');
  };

  const right = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <Pressable accessibilityLabel="대화 검색" hitSlop={8} onPress={() => setSearch((q) => (q === undefined ? '' : undefined))}>
        <Icon name="search" color={search !== undefined ? c.accent : c.text} size={22} />
      </Pressable>
      <Pressable accessibilityLabel="오픈대화방 메뉴" hitSlop={8} onPress={() => setMenu(true)}>
        <Icon name="menu" color={c.text} size={22} />
      </Pressable>
    </View>
  );

  return (
    <Screen title={`${room.title} (${room.members.length})`} back scroll={false} right={right}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
        {search !== undefined ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm, backgroundColor: c.surface, borderRadius: radius.lg, paddingHorizontal: space.md }}>
            <Icon name="search" color={c.faint} size={18} />
            <TextInput autoFocus value={search} onChangeText={setSearch} placeholder="대화내용 검색" placeholderTextColor={c.faint} style={{ flex: 1, paddingVertical: space.sm + 2, color: c.text, fontSize: font.body, fontFamily: family.regular }} />
          </View>
        ) : null}
        <FlatList
          ref={list}
          data={items}
          keyExtractor={(m) => m.id}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            if ('day' in item) return <DayDivider at={item.day} />;
            if (item.system)
              return <Text style={{ textAlign: 'center', fontFamily: family.regular, fontSize: 12, color: c.faint, marginVertical: space.sm }}>{item.text}</Text>;
            const mine = item.senderId === user.id;
            // 나간 사람은 닉네임 대신 '(나간 사람)'
            const name = aliasOf(room, item.senderId) ?? '(나간 사람)';
            return (
              <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', gap: space.sm, marginVertical: space.xs }}>
                {!mine ? <OpenAvatar label={name} size={36} /> : null}
                <View style={{ maxWidth: '78%', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  {!mine ? (
                    <Text style={{ fontFamily: family.semibold, fontSize: 13, color: c.sub, marginBottom: 2 }}>
                      {name}
                      {item.senderId === room.hostId ? ' · 방장' : ''}
                      {real(item.senderId) ? <Text style={{ color: c.accent }}>{`  ${real(item.senderId)}`}</Text> : null}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 4 }}>
                    <View style={{ flexShrink: 1, backgroundColor: mine ? c.bubbleMine : c.bubbleOther, borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.sm + 2 }}>
                      <Text style={{ fontFamily: family.regular, fontSize: 16, lineHeight: 23, color: mine ? c.bubbleMineText : c.text }}>
                        {markParts(item.text, query).map((p, i) =>
                          p.mark ? (
                            <Text key={i} style={{ backgroundColor: c.mark, color: c.markText }}>
                              {p.text}
                            </Text>
                          ) : (
                            p.text
                          ),
                        )}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: family.regular, fontSize: 11, color: c.faint }}>{clockTime(item.at)}</Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
        {!member ? (
          <View style={{ paddingVertical: space.md, alignItems: 'center', borderTopWidth: 1, borderTopColor: c.line }}>
            <Text style={{ fontFamily: family.semibold, fontSize: 14, color: c.sub }}>관리자로 보는 중 · 메시지 보내기 불가</Text>
          </View>
        ) : (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingVertical: space.sm }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={`${aliasOf(room, user.id) ?? ''}(으)로 메시지 입력`}
            placeholderTextColor={c.faint}
            multiline
            onSubmitEditing={send}
                {...enterToSend(send)}
            style={{ flex: 1, backgroundColor: c.surface, color: c.text, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md, fontSize: font.body, fontFamily: family.regular, maxHeight: 120 }}
          />
          <Pressable accessibilityLabel="보내기" onPress={send} style={{ backgroundColor: c.accent, borderRadius: 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="send" color="#FFFFFF" size={20} />
          </Pressable>
        </View>
        )}
      </KeyboardAvoidingView>

      <Sheet open={menu} onClose={() => setMenu(false)}>
        <Text style={{ fontFamily: family.bold, fontSize: 18, color: c.text }}>참여자 {room.members.length}/{room.max}</Text>
        {error ? <Notice text={error} /> : null}
        <ScrollView>
          {room.members.map((m) => (
            <View key={m.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm }}>
              <OpenAvatar label={m.alias} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: family.semibold, fontSize: 15, color: c.text }}>
                  {m.alias}
                  {m.userId === user.id ? ' (나)' : ''}
                  {m.userId === room.hostId ? ' · 방장' : ''}
                </Text>
                {real(m.userId) ? <Text style={{ fontFamily: family.regular, fontSize: 13, color: c.accent }}>{real(m.userId)}</Text> : null}
              </View>
              {(isHost || manager) && m.userId !== user.id ? (
                <Pressable
                  onPress={() => {
                    const r = actions.kickOpen(room.id, m.userId);
                    setError(r.ok ? '' : r.reason);
                  }}
                  style={{ paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: c.accent }}>
                  <Text style={{ fontFamily: family.semibold, fontSize: 13, color: c.accent }}>내보내기</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </ScrollView>
        {done ? <Notice text={done} tone="accent" /> : null}
        {isHost ? (
          <View style={{ gap: space.sm }}>
            <Text style={{ fontFamily: family.bold, fontSize: 15, color: c.text }}>비밀번호 {isLocked(room) ? '· 설정됨' : '· 없음'}</Text>
            <Input placeholder="새 비밀번호 4~16자" value={newPw} onChangeText={setNewPw} secureTextEntry autoCapitalize="none" />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  small
                  label={isLocked(room) ? '바꾸기' : '설정'}
                  onPress={() => {
                    if (!newPw.trim()) return setError('새 비밀번호를 입력해 주세요.');
                    const r = actions.setOpenPassword(room.id, newPw);
                    setError(r.ok ? '' : r.reason);
                    setDone(r.ok ? '비밀번호를 저장했습니다.' : '');
                    if (r.ok) setNewPw('');
                  }}
                />
              </View>
              {isLocked(room) ? (
                <View style={{ flex: 1 }}>
                  <Button
                    small
                    kind="soft"
                    label="해제"
                    onPress={() => {
                      const r = actions.setOpenPassword(room.id, '');
                      setError(r.ok ? '' : r.reason);
                      setDone(r.ok ? '비밀번호를 해제했습니다.' : '');
                    }}
                  />
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
        {member ? (
          <Pressable
            onPress={() => {
              actions.leaveOpenRoom(room.id);
              setMenu(false);
              router.back();
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
            <Icon name="exit" color={c.accent} size={20} />
            <Text style={{ fontFamily: family.semibold, fontSize: 15, color: c.accent }}>나가기</Text>
          </Pressable>
        ) : null}
        {isHost || manager ? (
          <Pressable
            onPress={() => {
              const r = actions.deleteOpenRoom(room.id);
              if (!r.ok) return setError(r.reason);
              setMenu(false);
              router.back();
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
            <Icon name="trash" color={c.accent} size={20} />
            <Text style={{ fontFamily: family.semibold, fontSize: 15, color: c.accent }}>방 없애기</Text>
          </Pressable>
        ) : null}
      </Sheet>
    </Screen>
  );
}
