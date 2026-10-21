import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { clientCanSee, dayKey, displayName, firstOfDay, lastReadAt, mentionQuery, messageDays, notifyLevel, searchMessages, visibleMessages } from '@/core/messenger';
import { aiCanJoin, ROOM_KIND_LABEL } from '@/core/rooms';
import { contactsFor } from '@/core/contacts';
import { actions } from '@/core/store';
import { AI_SENDER, BOT_SENDER, SYSTEM_SENDER, type Attachment, type Message, type User } from '@/core/types';
import { newId } from '@/core/ids';
import { CasePanel } from '@/ui/case-panel';
import { Bubble, CalendarSheet, ContactSheet, DayDivider, ForwardSheet, MessageMenu, NoticeBar, ReactionsSheet, ReadersSheet, RoomDrawer } from '@/ui/chat';
import { Icon, type IconName } from '@/ui/icons';
import { Avatar, Button, Empty, enterToSend, Input, ModeBadge, ModeBanner, Notice, Screen, Sub } from '@/ui/kit';
import { roomTitle } from '@/ui/room-row';
import { family, font, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

type Item = Message | { id: string; divider: 'unread' } | { id: string; divider: 'day'; at: string };

/** 날이 바뀌는 곳에 날짜 구분선을 넣습니다. */
function withDays(list: Item[]): Item[] {
  const out: Item[] = [];
  let last = '';
  for (const it of list) {
    if (!('divider' in it)) {
      const k = dayKey(it.at);
      if (k !== last) out.push({ id: `__day_${k}`, divider: 'day', at: it.at });
      last = k;
    }
    out.push(it);
  }
  return out;
}

export default function RoomScreen() {
  // q·focus: 대화 탭 전체 검색에서 메시지를 눌러 들어온 경우
  const { id, q, focus } = useLocalSearchParams<{ id: string; q?: string; focus?: string }>();
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const room = s.rooms.find((r) => r.id === id);
  const messages = useMemo(() => visibleMessages(s.messages, id, user.id), [s.messages, id, user.id]);
  // 들어올 때 마지막으로 읽은 시각: '읽지 않은 메시지' 구분선 위치
  const [readSnapshot] = useState(() => lastReadAt(s.reads, id, user.id));
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Message>();
  const [menuFor, setMenuFor] = useState<Message>();
  const [forwardIds, setForwardIds] = useState<string[]>();
  const [picking, setPicking] = useState<string[]>();
  const [readsFor, setReadsFor] = useState<Message>();
  const [reactFor, setReactFor] = useState<Message>();
  const [drawer, setDrawer] = useState(false);
  const [plus, setPlus] = useState(false);
  const [contactPick, setContactPick] = useState(false);
  const [search, setSearch] = useState<string | undefined>(q || undefined);
  // 지금 보고 있는 검색 결과 (hits 안의 순서, 기본은 가장 최근)
  const [cursor, setCursor] = useState(-1);
  const [calendar, setCalendar] = useState(false);
  const [highlight, setHighlight] = useState<string>();
  const [toast, setToast] = useState('');
  const [promote, setPromote] = useState({ open: false, title: '', field: '', error: '' });
  const list = useRef<FlatList<Item>>(null);
  const isMember = !!room?.memberIds.includes(user.id);

  useEffect(() => {
    if (isMember) actions.markRead(id);
  }, [id, isMember, messages.length]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const query = search?.trim() ?? '';
  const hits = useMemo(() => searchMessages(messages, query), [messages, query]);
  const currentHit = hits[cursor];

  const items = useMemo<Item[]>(() => {
    const first = readSnapshot ? messages.findIndex((m) => m.at > readSnapshot && m.senderId !== user.id && m.senderId !== SYSTEM_SENDER) : -1;
    if (first <= 0) return withDays(messages);
    return withDays([...messages.slice(0, first), { id: '__unread', divider: 'unread' }, ...messages.slice(first)]);
  }, [messages, readSnapshot, user.id]);

  const scrollTo = (itemId: string) => {
    setTimeout(() => {
      const index = items.findIndex((m) => m.id === itemId);
      if (index >= 0) list.current?.scrollToIndex({ index, viewPosition: 0.4, animated: true });
    }, 60);
  };

  // 검색어가 바뀌면 가장 최근 결과부터 (전체 검색에서 고른 메시지가 있으면 그것부터)
  useEffect(() => {
    if (!query) {
      setCursor(-1);
      return;
    }
    const at = focus ? hits.findIndex((m) => m.id === focus) : -1;
    setCursor(at >= 0 ? at : hits.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    if (currentHit) scrollTo(currentHit.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHit?.id]);

  // 의뢰인 계정: 자기 상담·사건방만, 대화와 검색만 (전달·공지·방 메뉴·첨부 없음)
  const simple = user.role === 'client';
  if (!room || (simple && !clientCanSee(room, user))) return <Screen title="대화" back><Empty text="방을 찾을 수 없습니다." /></Screen>;
  const members = room.memberIds.map((mid) => s.users.find((u) => u.id === mid)).filter((u): u is User => !!u);
  const muted = notifyLevel(room, user.id) !== 'all';

  // @멘션 자동완성
  const mq = mentionQuery(text);
  const mentionList =
    mq === undefined || simple
      ? []
      : [{ id: 'all', nickname: '전체' } as User, ...members.filter((u) => u.id !== user.id)].filter((u) => u.nickname.includes(mq)).slice(0, 6);
  const pickMention = (u: User) => setText((t) => t.replace(/@([^\s@]*)$/, `@${u.nickname} `));

  const send = () => {
    if (!text.trim()) return;
    void actions.sendMessage(room.id, text, { replyTo: replyTo?.id });
    setText('');
    setReplyTo(undefined);
  };

  const sendFiles = (files: Attachment[]) => {
    setPlus(false);
    if (!files.length) return;
    const res = actions.sendFiles(room.id, files, { replyTo: replyTo?.id });
    if (!res.ok) setToast(res.reason);
    else setReplyTo(undefined);
  };
  const pickPhotos = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10, quality: 0.8 });
    if (res.canceled) return;
    sendFiles(res.assets.map((a) => ({ id: newId('f'), kind: 'image', name: a.fileName ?? '사진.jpg', uri: a.uri, size: a.fileSize, mime: a.mimeType ?? 'image/jpeg' })));
  };
  const pickFiles = async () => {
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return;
    sendFiles(res.assets.map((a) => ({ id: newId('f'), kind: a.mimeType?.startsWith('image/') ? 'image' : 'file', name: a.name, uri: a.uri, size: a.size, mime: a.mimeType })));
  };

  const jump = (messageId: string) => {
    setHighlight(messageId);
    scrollTo(messageId);
    setTimeout(() => setHighlight(undefined), 2000);
  };

  // 캘린더에서 고른 날의 첫 대화로
  const jumpToDay = (day: string) => {
    const m = firstOfDay(messages, day);
    if (!m) return;
    setHighlight(m.id);
    scrollTo(`__day_${day}`);
    setTimeout(() => setHighlight(undefined), 2000);
  };

  const doPromote = () => {
    const res = actions.promoteToCase(room.id, promote.title, promote.field);
    setPromote((p) => ({ ...p, error: res.ok ? '' : res.reason, open: !res.ok }));
  };

  const myRooms = s.rooms.filter((r) => r.memberIds.includes(user.id) && r.id !== room.id);
  const shareable = contactsFor(user, s);

  const header = (
    <View style={{ gap: space.sm, marginBottom: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <ModeBadge mode={room.mode} />
        <Sub>{ROOM_KIND_LABEL[room.kind]}</Sub>
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
      {room.kind === 'meeting' ? <Button label="회의 정리 화면 열기" kind="soft" onPress={() => router.push({ pathname: '/agent/meeting', params: { roomId: room.id } })} /> : null}
    </View>
  );

  const togglePick = (mid: string) => setPicking((cur) => (cur ? (cur.includes(mid) ? cur.filter((x) => x !== mid) : [...cur, mid]) : cur));

  const right = picking ? (
    <Pressable accessibilityLabel="선택 취소" hitSlop={8} onPress={() => setPicking(undefined)}>
      <Text style={{ fontFamily: family.semibold, fontSize: 16, color: c.text }}>취소</Text>
    </Pressable>
  ) : (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      {muted ? <Icon name="mute" color={c.faint} size={18} /> : null}
      <Pressable accessibilityLabel="대화 검색" hitSlop={8} onPress={() => setSearch((cur) => (cur === undefined ? '' : undefined))}>
        <Icon name="search" color={search !== undefined ? c.accent : c.text} size={22} />
      </Pressable>
      {simple ? null : (
        <Pressable accessibilityLabel="대화방 메뉴" hitSlop={8} onPress={() => setDrawer(true)}>
          <Icon name="menu" color={c.text} size={22} />
        </Pressable>
      )}
    </View>
  );

  const inputStyle = { flex: 1, backgroundColor: c.surface, color: c.text, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md, fontSize: font.body, fontFamily: family.regular, maxHeight: 120 };

  return (
    <Screen title={roomTitle(room)} back scroll={false} right={right}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
        {search !== undefined ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm, backgroundColor: c.surface, borderRadius: radius.lg, paddingHorizontal: space.md }}>
            <Icon name="search" color={c.faint} size={18} />
            <TextInput autoFocus value={search} onChangeText={setSearch} placeholder="대화내용 검색" placeholderTextColor={c.faint} style={{ flex: 1, paddingVertical: space.sm + 2, color: c.text, fontSize: font.body, fontFamily: family.regular }} />
            {search ? (
              <Pressable accessibilityLabel="검색어 지우기" hitSlop={8} onPress={() => setSearch('')}>
                <Icon name="close" color={c.faint} size={16} />
              </Pressable>
            ) : null}
          </View>
        ) : (
          <NoticeBar room={room} me={user} users={s.users} onJump={jump} />
        )}
        <FlatList
          ref={list}
          data={items}
          keyExtractor={(m) => m.id}
          ListHeaderComponent={header}
          onContentSizeChange={() => {
            if (!query && !highlight) list.current?.scrollToEnd({ animated: false });
          }}
          onScrollToIndexFailed={({ averageItemLength, index }) => list.current?.scrollToOffset({ offset: averageItemLength * index, animated: true })}
          renderItem={({ item }) =>
            'divider' in item && item.divider === 'day' ? (
              <DayDivider at={item.at} />
            ) : 'divider' in item ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginVertical: space.md }}>
                <View style={{ flex: 1, height: 1, backgroundColor: c.accent, opacity: 0.4 }} />
                <Text style={{ fontFamily: family.semibold, fontSize: 12, color: c.accent }}>읽지 않은 메시지</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: c.accent, opacity: 0.4 }} />
              </View>
            ) : (
              <Bubble
                  m={item}
                  me={user}
                  room={room}
                  users={s.users}
                  reads={s.reads}
                  messages={s.messages}
                  highlight={highlight === item.id}
                  mark={query || undefined}
                  current={currentHit?.id === item.id}
                  onReads={() => setReadsFor(item)}
                  onReactions={() => setReactFor(item)}
                  picking={!!picking && !item.recalled && item.senderId !== SYSTEM_SENDER}
                  picked={picking?.includes(item.id)}
                  onPick={() => togglePick(item.id)}
                  onLongPress={() => (isMember && item.senderId !== AI_SENDER && item.senderId !== BOT_SENDER ? setMenuFor(item) : undefined)}
                />
            )
          }
        />
        {toast ? (
          <View style={{ alignSelf: 'center', backgroundColor: c.text, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm, marginBottom: space.sm }}>
            <Text style={{ fontFamily: family.semibold, fontSize: 13, color: c.bg }}>{toast}</Text>
          </View>
        ) : null}
        {search !== undefined ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: c.line }}>
            <Pressable accessibilityLabel="날짜로 찾기" hitSlop={8} onPress={() => setCalendar(true)} style={{ padding: space.sm }}>
              <Icon name="calendar" color={c.text} size={24} />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', fontFamily: family.bold, fontSize: 16, color: c.text }}>
              {query ? (hits.length ? `${hits.length - cursor}/${hits.length}` : '결과 없음') : ''}
            </Text>
            <SearchArrow dir="up" enabled={cursor > 0} onPress={() => setCursor((i) => i - 1)} />
            <SearchArrow dir="down" enabled={cursor >= 0 && cursor < hits.length - 1} onPress={() => setCursor((i) => i + 1)} />
          </View>
        ) : picking ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderTopWidth: 1, borderTopColor: c.line }}>
            <Text style={{ fontFamily: family.bold, fontSize: 15, color: c.text }}>{picking.length}개 선택</Text>
            <Pressable
              accessibilityLabel="선택한 메시지 전달"
              disabled={!picking.length}
              onPress={() => setForwardIds(picking)}
              style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: picking.length ? c.accent : c.line, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
              <Icon name="forward" color="#FFFFFF" size={18} />
              <Text style={{ fontFamily: family.bold, fontSize: 15, color: '#FFFFFF' }}>전달</Text>
            </Pressable>
          </View>
        ) : isMember ? (
          <View>
            {replyTo ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, borderTopWidth: 1, borderTopColor: c.line, paddingTop: space.sm }}>
                <Icon name="reply" color={c.accent} size={18} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: family.semibold, fontSize: 13, color: c.accent }}>
                    {s.users.find((u) => u.id === replyTo.senderId)?.nickname ?? ''}에게 답장
                  </Text>
                  <Text numberOfLines={1} style={{ fontFamily: family.regular, fontSize: 13, color: c.sub }}>{replyTo.text}</Text>
                </View>
                <Pressable accessibilityLabel="답장 취소" hitSlop={8} onPress={() => setReplyTo(undefined)}>
                  <Icon name="close" color={c.faint} size={18} />
                </Pressable>
              </View>
            ) : null}
            {mentionList.length ? (
              <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: radius.md, marginTop: space.sm, overflow: 'hidden' }}>
                {mentionList.map((u) => (
                  <Pressable key={u.id} onPress={() => pickMention(u)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, backgroundColor: pressed ? c.surface : c.bg })}>
                    <Avatar name={u.nickname} size={28} group={u.id === 'all'} uri={u.photo} />
                    <Text style={{ fontFamily: family.semibold, fontSize: 14, color: c.text }}>{u.id === 'all' ? '전체' : displayName(u)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {plus ? (
              <View style={{ flexDirection: 'row', gap: space.lg, paddingVertical: space.md }}>
                <PlusItem icon="image" label="사진" onPress={() => void pickPhotos()} />
                <PlusItem icon="file" label="파일" onPress={() => void pickFiles()} />
                {simple ? null : (
                  <PlusItem
                    icon="contact"
                    label="연락처"
                    onPress={() => {
                      setPlus(false);
                      setContactPick(true);
                    }}
                  />
                )}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingVertical: space.sm }}>
              <Pressable accessibilityLabel="더하기" onPress={() => setPlus((v) => !v)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: plus ? '45deg' : '0deg' }] }}>
                <Icon name="plus" color={c.sub} size={24} />
              </Pressable>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={aiCanJoin(room) ? '메시지 입력 · @AI 도움말' : '메시지 입력'}
                placeholderTextColor={c.faint}
                multiline
                onSubmitEditing={send}
                {...enterToSend(send)}
                style={inputStyle}
              />
              <Pressable accessibilityLabel="보내기" onPress={send} style={{ backgroundColor: c.accent, borderRadius: 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="send" color="#FFFFFF" size={20} />
              </Pressable>
            </View>
          </View>
        ) : (
          <Notice text="이 방의 참여자가 아닙니다." />
        )}
      </KeyboardAvoidingView>

      <MessageMenu
        m={menuFor}
        mine={menuFor?.senderId === user.id}
        myId={user.id}
        simple={simple}
        onClose={() => setMenuFor(undefined)}
        onCopy={() => {
          if (!menuFor) return;
          void Clipboard.setStringAsync(menuFor.forwardOf?.text ?? menuFor.text);
          setToast('복사했습니다.');
        }}
        onReply={() => setReplyTo(menuFor)}
        onForward={() => menuFor && setPicking([menuFor.id])}
        onNotice={() => {
          if (!menuFor) return;
          const res = actions.setNotice(menuFor.id);
          if (!res.ok) setToast(res.reason);
        }}
      />
      <ForwardSheet
        ids={forwardIds}
        rooms={myRooms}
        onClose={() => setForwardIds(undefined)}
        onDone={(r) => {
          setPicking(undefined);
          setToast(`${r.title}에 전달했습니다.`);
        }}
      />
      <ReadersSheet m={readsFor} room={room} reads={s.reads} users={s.users} onClose={() => setReadsFor(undefined)} />
      <ReactionsSheet m={reactFor ? s.messages.find((x) => x.id === reactFor.id) : undefined} me={user} users={s.users} onClose={() => setReactFor(undefined)} />
      {calendar ? <CalendarSheet open days={messageDays(messages)} onClose={() => setCalendar(false)} onPick={jumpToDay} /> : null}
      <ContactSheet open={contactPick} contacts={shareable} onClose={() => setContactPick(false)} onPick={(u) => actions.shareContact(room.id, u.id)} />
      <RoomDrawer open={drawer} onClose={() => setDrawer(false)} room={room} me={user} users={s.users} messages={messages} onError={setToast} />
    </Screen>
  );
}

function PlusItem({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityLabel={`${label} 보내기`} onPress={onPress} style={{ alignItems: 'center', gap: 6 }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} color={c.text} size={24} />
      </View>
      <Text style={{ fontFamily: family.regular, fontSize: 12, color: c.text }}>{label}</Text>
    </Pressable>
  );
}

/** 검색 결과 이동: 위는 이전(오래된) 결과, 아래는 다음(최근) 결과 */
function SearchArrow({ dir, enabled, onPress }: { dir: 'up' | 'down'; enabled: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityLabel={dir === 'up' ? '이전 결과' : '다음 결과'}
      disabled={!enabled}
      onPress={onPress}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: dir === 'up' ? '-90deg' : '90deg' }] }}>
      <Icon name="chevron" color={enabled ? c.text : c.line} size={20} />
    </Pressable>
  );
}
