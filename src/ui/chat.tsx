// 대화방 화면 조각 (웍스 대화방 구성: 읽음 수, 답장 인용, 전달, 회수, 공감, 멘션, 공지, 방 메뉴)
import { router } from 'expo-router';
import { createElement, useState, type ReactNode } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { dayLabel, displayName, isMaster, markParts, notifyLevel, reactionGroups, readCount, readers, roomLinks, splitMentions, type Reads } from '@/core/messenger';
import { actions } from '@/core/store';
import { AI_SENDER, BOT_SENDER, SYSTEM_SENDER, type Attachment, type Message, type NotifyLevel, type Room, type User } from '@/core/types';
import { isSelfRoom } from '@/core/calendar';
import { Icon, type IconName } from './icons';
import { HearingCard } from './hearing';
import { FileActions, fileSize, isVideo, openFile } from './board';
import { openViewer } from './image-viewer';
import { Avatar } from './kit';
import { chatTime, clockTime, roomTitle } from './room-row';
import { family, radius, space, useColors } from './theme';

export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function nameOf(users: User[], id: string): string {
  if (id === AI_SENDER) return '✦ AI';
  if (id === BOT_SENDER) return '✦ AI 알림';
  return users.find((u) => u.id === id)?.nickname ?? '알 수 없음';
}

/** 본문: @멘션은 강조, 검색어는 형광펜 */
function Body({ text, names, color, mention, mark }: { text: string; names: string[]; color: string; mention: string; mark?: string }) {
  const c = useColors();
  return (
    <Text style={{ ...family.regular, fontSize: 16, lineHeight: 23, color }}>
      {splitMentions(text, names).map((p, i) => (
        <Text key={i} style={p.mention ? { color: mention, ...family.semibold } : undefined}>
          {mark
            ? markParts(p.text, mark).map((q, j) =>
                q.mark ? (
                  <Text key={j} style={{ backgroundColor: c.mark, color: c.markText }}>
                    {q.text}
                  </Text>
                ) : (
                  q.text
                ),
              )
            : p.text}
        </Text>
      ))}
    </Text>
  );
}

export function Bubble({
  m,
  me,
  room,
  users,
  reads,
  messages,
  onLongPress,
  highlight,
  onReads,
  onReactions,
  picking,
  picked,
  onPick,
  mark,
  current,
}: {
  m: Message;
  me: User;
  room: Room;
  users: User[];
  reads: Reads;
  messages: Message[];
  /** 길게 누르기, PC는 마우스 오른쪽 버튼 (누른 자리) */
  onLongPress: (at?: { x: number; y: number }) => void;
  highlight?: boolean;
  onReads?: () => void;
  onReactions?: () => void;
  /** 전달할 말풍선 고르는 중 */
  picking?: boolean;
  picked?: boolean;
  onPick?: () => void;
  /** 방 안 검색어 (형광펜) */
  mark?: string;
  /** 지금 보고 있는 검색 결과 */
  current?: boolean;
}) {
  const c = useColors();
  if (m.senderId === SYSTEM_SENDER) {
    return (
      <View style={{ alignItems: 'center', marginVertical: space.sm }}>
        <Text style={{ ...family.regular, fontSize: 12, color: c.faint, textAlign: 'center' }}>{m.text}</Text>
      </View>
    );
  }
  const sender = users.find((u) => u.id === m.senderId);
  if (m.recalled) {
    return (
      <View style={{ alignItems: 'center', marginVertical: space.sm }}>
        <Text style={{ ...family.regular, fontSize: 12, color: c.faint }}>{sender?.nickname ?? ''}님이 메시지를 회수하였습니다.</Text>
      </View>
    );
  }
  const mine = m.senderId === me.id;
  const isAi = m.senderId === AI_SENDER;
  const isBot = m.senderId === BOT_SENDER;
  const human = !isAi && !isBot;
  const names = room.memberIds.map((id) => users.find((u) => u.id === id)?.nickname).filter((n): n is string => !!n);
  const fg = mine ? c.bubbleMineText : c.text;
  const quoted = m.replyTo ? messages.find((x) => x.id === m.replyTo) : undefined;
  const contact = m.kind === 'contact' ? users.find((u) => u.id === m.contactId) : undefined;
  const read = human ? readCount(m, room, reads) : 0;
  const reactions = Object.values(m.reactions ?? {}).reduce<Record<string, number>>((acc, e) => ({ ...acc, [e]: (acc[e] ?? 0) + 1 }), {});
  const myReaction = m.reactions?.[me.id];

  const meta = (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', justifyContent: 'flex-end', paddingHorizontal: 4 }}>
      {read > 0 ? (
        <Pressable accessibilityLabel="읽은 사람 보기" disabled={!onReads} onPress={onReads} hitSlop={6}>
          <Text style={{ ...family.semibold, fontSize: 11, color: c.accent }}>읽음 {read}</Text>
        </Pressable>
      ) : null}
      <Text style={{ ...family.regular, fontSize: 11, color: c.faint }}>{clockTime(m.at)}</Text>
    </View>
  );

  const card = !!(contact || m.forwardOf || m.bundle || m.hearingAlertId);
  // 사진·동영상·파일만 보낸 메시지는 말풍선 테두리 없이 (파일은 자기 말풍선)
  const bare = !card && !quoted && !m.text && !!m.attachments?.length;
  const row = (
    <View style={{ flex: 1, flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', gap: space.sm, marginVertical: space.xs, backgroundColor: highlight ? c.accentSoft : 'transparent', borderRadius: radius.sm }}>
      {!mine ? <Avatar name={isAi || isBot ? 'AI' : sender?.nickname ?? '?'} size={36} tone={isAi ? c.aiSoft : undefined} uri={isAi || isBot ? undefined : sender?.photo} /> : null}
      <View style={{ maxWidth: '78%', alignItems: mine ? 'flex-end' : 'flex-start' }}>
        {!mine ? (
          <Text numberOfLines={1} style={{ ...family.semibold, fontSize: 13, color: isAi ? c.ai : isBot ? c.accent : c.sub, marginBottom: 2 }}>
            {isAi || isBot ? nameOf(users, m.senderId) : sender ? displayName(sender) : ''}
          </Text>
        ) : null}
        <View style={{ flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 2 }}>
          <Pressable
            accessibilityLabel="메시지"
            onPress={picking ? onPick : undefined}
            onLongPress={picking ? undefined : () => onLongPress()}
            delayLongPress={350}
            {...(Platform.OS === 'web' && !picking
              ? {
                  onContextMenu: (e: { preventDefault: () => void; nativeEvent: { clientX: number; clientY: number } }) => {
                    e.preventDefault();
                    onLongPress({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
                  },
                }
              : null)}
            style={{
              flexShrink: 1,
              width: m.bundle ? 250 : undefined,
              backgroundColor: bare ? 'transparent' : card ? c.bg : mine ? c.bubbleMine : isAi ? c.aiSoft : isBot ? c.accentSoft : c.bubbleOther,
              borderWidth: current ? 2 : card ? 1 : 0,
              borderColor: current ? c.mark : c.line,
              borderRadius: radius.lg,
              paddingHorizontal: bare ? 0 : space.md,
              paddingVertical: bare ? 0 : space.sm + 2,
              gap: space.xs,
            }}>
            {quoted ? (
              <View style={{ borderLeftWidth: 2, borderLeftColor: mine ? 'rgba(255,255,255,0.7)' : c.accent, paddingLeft: space.sm, marginBottom: 2 }}>
                <Text style={{ ...family.semibold, fontSize: 12, color: mine ? c.bubbleMineText : c.sub }}>{nameOf(users, quoted.senderId)}에게 답장</Text>
                <Text numberOfLines={2} style={{ ...family.regular, fontSize: 13, color: mine ? c.bubbleMineText : c.sub }}>
                  {quoted.recalled ? '회수된 메시지입니다.' : quoted.text}
                </Text>
              </View>
            ) : null}
            {m.hearingAlertId ? (
              <HearingCard alertId={m.hearingAlertId} />
            ) : m.bundle ? (
              <BundleCard m={m} users={users} mark={mark} />
            ) : m.forwardOf ? (
              <>
                <Text style={{ ...family.semibold, fontSize: 12, color: c.sub }}>전달 · {nameOf(users, m.forwardOf.senderId)}</Text>
                <Body text={m.forwardOf.text} names={names} color={c.text} mention={c.accent} mark={mark} />
              </>
            ) : contact ? (
              <Pressable onPress={() => router.push({ pathname: '/contact/[id]', params: { id: contact.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minWidth: 200 }}>
                <Avatar name={contact.nickname} size={40} uri={contact.photo} />
                <View style={{ flex: 1 }}>
                  <Text style={{ ...family.bold, fontSize: 15, color: c.text }}>{contact.nickname}</Text>
                  <Text numberOfLines={1} style={{ ...family.regular, fontSize: 12, color: c.sub }}>{[contact.title, contact.dept].filter(Boolean).join(' · ') || '연락처'}</Text>
                </View>
                <Icon name="chevron" color={c.faint} size={18} />
              </Pressable>
            ) : (
              <>
                {m.attachments?.length ? <MessageFiles items={m.attachments} mine={mine} title={room.title} boxed={bare} /> : null}
                {m.text ? <Body text={m.text} names={names} color={fg} mention={mine ? c.bubbleMineText : c.accent} mark={mark} /> : null}
              </>
            )}
          </Pressable>
          {meta}
        </View>
        {Object.keys(reactions).length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {Object.entries(reactions).map(([e, n]) => (
              <Pressable
                key={e}
                accessibilityLabel={`공감한 사람 ${e}`}
                onPress={onReactions}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1, borderColor: myReaction === e ? c.accent : c.line, backgroundColor: c.bg }}>
                <Text style={{ fontSize: 13 }}>{e}</Text>
                <Text style={{ ...family.semibold, fontSize: 12, color: myReaction === e ? c.accent : c.sub }}>{n}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
  if (!picking) return row;
  return (
    <Pressable accessibilityLabel="말풍선 선택" onPress={onPick} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: picked ? c.accent : c.faint, backgroundColor: picked ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {picked ? <Icon name="check" color="#FFFFFF" size={13} /> : null}
      </View>
      {row}
    </Pressable>
  );
}

/** 묶어서 전달한 메시지: 미리보기 2줄 + '메시지 상세보기' */
function BundleCard({ m, users, mark }: { m: Message; users: User[]; mark?: string }) {
  const c = useColors();
  const b = m.bundle!;
  return (
    <View style={{ gap: space.sm }}>
      <Text style={{ ...family.bold, fontSize: 15, color: c.accent }}>전달</Text>
      <Text numberOfLines={1} style={{ ...family.regular, fontSize: 13, color: c.sub }}>{b.title}</Text>
      <View style={{ height: 1, backgroundColor: c.line }} />
      {b.items.slice(0, 2).map((i, k) => (
        <Text key={k} numberOfLines={1} style={{ ...family.regular, fontSize: 14, color: c.text }}>
          {nameOf(users, i.senderId)}:{' '}
          {markParts(i.text.split('\n')[0], mark ?? '').map((q, j) =>
            q.mark ? (
              <Text key={j} style={{ backgroundColor: c.mark, color: c.markText }}>
                {q.text}
              </Text>
            ) : (
              q.text
            ),
          )}
        </Text>
      ))}
      {b.items.length > 2 ? <Text style={{ ...family.regular, fontSize: 12, color: c.faint }}>외 {b.items.length - 2}개</Text> : null}
      <Pressable
        accessibilityLabel="메시지 상세보기"
        onPress={() => router.push({ pathname: '/room/bundle/[id]', params: { id: m.id } })}
        style={({ pressed }) => ({ alignItems: 'center', paddingVertical: space.sm, borderRadius: radius.sm, backgroundColor: c.surface, opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ ...family.semibold, fontSize: 14, color: c.accent }}>메시지 상세보기</Text>
      </Pressable>
    </View>
  );
}

/** 날짜 구분선 */
export function DayDivider({ at }: { at: string }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', marginVertical: space.md }}>
      <View style={{ backgroundColor: c.surface, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 4 }}>
        <Text style={{ ...family.regular, fontSize: 12, color: c.sub }}>{dayLabel(at)}</Text>
      </View>
    </View>
  );
}

function PersonRow({ u, right }: { u: User; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm }}>
      <Avatar name={u.nickname} size={36} uri={u.photo} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ ...family.semibold, fontSize: 15, color: c.text }}>{displayName(u)}</Text>
        {u.dept ? <Text numberOfLines={1} style={{ ...family.regular, fontSize: 12, color: c.sub }}>{u.dept}</Text> : null}
      </View>
      {right}
    </View>
  );
}

function SheetTabs<K extends string>({ tabs, value, onChange }: { tabs: [K, string][]; value: K; onChange: (k: K) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: space.lg, borderBottomWidth: 1, borderBottomColor: c.line }}>
      {tabs.map(([k, label]) => (
        <Pressable key={k} onPress={() => onChange(k)} style={{ paddingVertical: space.sm, borderBottomWidth: 2, borderBottomColor: value === k ? c.accent : 'transparent', marginBottom: -1 }}>
          <Text style={{ ...family.semibold, fontSize: 15, color: value === k ? c.accent : c.sub }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** 읽음 상세: 읽은 사람 / 안 읽은 사람 */
export function ReadersSheet({ m, room, reads, users, onClose }: { m?: Message; room: Room; reads: Reads; users: User[]; onClose: () => void }) {
  const [tab, setTab] = useState<'read' | 'unread'>('read');
  const r = m ? readers(m, room, reads, users) : { read: [], unread: [] };
  const list = tab === 'read' ? r.read : r.unread;
  return (
    <Sheet open={!!m} onClose={onClose}>
      <SheetTabs tabs={[['read', `읽음 ${r.read.length}`], ['unread', `안 읽음 ${r.unread.length}`]]} value={tab} onChange={setTab} />
      <ScrollView>
        {list.map((u) => (
          <PersonRow key={u.id} u={u} />
        ))}
      </ScrollView>
    </Sheet>
  );
}

/** 공감 상세: 누가 어떤 공감을 했는지 */
export function ReactionsSheet({ m, me, users, onClose }: { m?: Message; me: User; users: User[]; onClose: () => void }) {
  const c = useColors();
  const [tab, setTab] = useState('all');
  const groups = m ? reactionGroups(m) : [];
  const entries = Object.entries(m?.reactions ?? {}).filter(([, e]) => tab === 'all' || e === tab);
  const mine = m?.reactions?.[me.id];
  return (
    <Sheet
      open={!!m}
      onClose={() => {
        setTab('all');
        onClose();
      }}>
      <SheetTabs tabs={[['all', `전체 ${Object.keys(m?.reactions ?? {}).length}`], ...groups.map(([e, ids]) => [e, `${e} ${ids.length}`] as [string, string])]} value={tab} onChange={setTab} />
      <ScrollView>
        {entries.map(([uid, e]) => {
          const u = users.find((x) => x.id === uid);
          return u ? <PersonRow key={uid} u={u} right={<Text style={{ fontSize: 22 }}>{e}</Text>} /> : null;
        })}
      </ScrollView>
      {m && mine ? (
        <Pressable
          onPress={() => {
            actions.react(m.id, mine);
            onClose();
          }}
          style={{ alignItems: 'center', paddingVertical: space.sm }}>
          <Text style={{ ...family.semibold, fontSize: 14, color: c.faint }}>내 공감 {mine} 취소</Text>
        </Pressable>
      ) : null}
    </Sheet>
  );
}

/** 바닥에서 올라오는 시트 */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const c = useColors();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="닫기" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: c.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, gap: space.sm, maxHeight: '80%', width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MenuItem({ icon, label, onPress, danger }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ width: '25%', alignItems: 'center', gap: 6, paddingVertical: space.md, opacity: pressed ? 0.5 : 1 })}>
      <Icon name={icon} color={danger ? c.accent : c.text} size={24} />
      <Text style={{ ...family.regular, fontSize: 13, color: danger ? c.accent : c.text }}>{label}</Text>
    </Pressable>
  );
}

/** 메시지 길게 누르기 메뉴: 공감 + 복사·답장·공지·전달·삭제·회수 */
export function MessageMenu({
  m,
  mine,
  myId,
  simple,
  onClose,
  onCopy,
  onReply,
  onForward,
  onNotice,
  at,
}: {
  m?: Message;
  mine: boolean;
  myId: string;
  /** PC에서 마우스 오른쪽 버튼을 누른 자리: 그 옆에 작은 메뉴로 띄웁니다 */
  at?: { x: number; y: number };
  /** 의뢰인 화면: 복사·답장·삭제·회수만 */
  simple?: boolean;
  onClose: () => void;
  onCopy: () => void;
  onReply: () => void;
  onForward: () => void;
  onNotice: () => void;
}) {
  const c = useColors();
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  if (m && at) {
    const items: { icon: IconName; label: string; onPress: () => void; danger?: boolean; line?: boolean }[] = [
      ...(m.kind !== 'contact' ? [{ icon: 'copy' as const, label: '복사', onPress: onCopy }] : []),
      { icon: 'reply', label: '답장', onPress: onReply },
      ...(m.kind !== 'contact' && !simple ? [{ icon: 'notice' as const, label: '공지', onPress: onNotice }] : []),
      ...(simple ? [] : [{ icon: 'forward' as const, label: '전달', onPress: onForward, line: true }]),
      { icon: 'trash', label: '삭제', onPress: () => actions.deleteForMe(m.id), line: simple },
      ...(mine ? [{ icon: 'recall' as const, label: '회수', onPress: () => void actions.recall(m.id), danger: true }] : []),
    ];
    const w = typeof window === 'undefined' ? { innerWidth: 1000, innerHeight: 800 } : window;
    const height = 44 + items.length * 38 + 12;
    return (
      <Modal visible transparent onRequestClose={onClose}>
        <Pressable accessibilityLabel="메뉴 닫기" onPress={onClose} style={{ flex: 1 }}>
          <Pressable
            onPress={() => undefined}
            style={{ position: 'absolute', left: Math.max(8, Math.min(at.x, w.innerWidth - 196)), top: Math.max(8, Math.min(at.y, w.innerHeight - height - 8)), width: 188, backgroundColor: c.bg, borderRadius: 10, borderWidth: 1, borderColor: c.line, paddingVertical: 6, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 4, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: c.line }}>
              {REACTIONS.map((e) => (
                <Pressable key={e} accessibilityLabel={`공감 ${e}`} onPress={run(() => actions.react(m.id, e))} style={{ padding: 3, borderRadius: radius.pill, backgroundColor: m.reactions?.[myId] === e ? c.surface : 'transparent' }}>
                  <Text style={{ fontSize: 18 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
            {items.map((it) => (
              <View key={it.label}>
                {it.line ? <View style={{ height: 1, backgroundColor: c.line, marginVertical: 4 }} /> : null}
                <Pressable onPress={run(it.onPress)} style={(st) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 34, paddingHorizontal: space.md, backgroundColor: (st as { hovered?: boolean }).hovered ? c.surface : 'transparent' })}>
                  <Icon name={it.icon} color={it.danger ? c.accent : c.sub} size={17} />
                  <Text style={{ ...family.regular, fontSize: 14, color: it.danger ? c.accent : c.text }}>{it.label}</Text>
                </Pressable>
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    );
  }
  return (
    <Sheet open={!!m} onClose={onClose}>
      {m ? (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingBottom: space.sm, borderBottomWidth: 1, borderBottomColor: c.line }}>
            {REACTIONS.map((e) => (
              <Pressable key={e} accessibilityLabel={`공감 ${e}`} onPress={run(() => actions.react(m.id, e))} style={{ padding: space.sm, borderRadius: radius.pill, backgroundColor: m.reactions?.[myId] === e ? c.surface : 'transparent' }}>
                <Text style={{ fontSize: 26 }}>{e}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {m.kind !== 'contact' ? <MenuItem icon="copy" label="복사" onPress={run(onCopy)} /> : null}
            <MenuItem icon="reply" label="답장" onPress={run(onReply)} />
            {m.kind !== 'contact' && !simple ? <MenuItem icon="notice" label="공지" onPress={run(onNotice)} /> : null}
            {simple ? null : <MenuItem icon="forward" label="전달" onPress={run(onForward)} />}
            <MenuItem icon="trash" label="삭제" onPress={run(() => actions.deleteForMe(m.id))} />
            {mine ? <MenuItem icon="recall" label="회수" danger onPress={run(() => void actions.recall(m.id))} /> : null}
          </View>
        </>
      ) : null}
    </Sheet>
  );
}

/** 전달할 방 고르기 */
export function ForwardSheet({ ids, rooms, onClose, onDone }: { ids?: string[]; rooms: Room[]; onClose: () => void; onDone: (room: Room) => void }) {
  const c = useColors();
  return (
    <Sheet open={!!ids?.length} onClose={onClose}>
      <Text style={{ ...family.bold, fontSize: 18, color: c.text }}>전달할 대화방</Text>
      <ScrollView>
        {rooms.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => {
              if (ids && actions.forwardMany(ids, r.id).ok) onDone(r);
              onClose();
            }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, opacity: pressed ? 0.5 : 1 })}>
            <Avatar name={r.title} size={40} group={r.memberIds.length > 2} />
            <Text numberOfLines={1} style={{ flex: 1, ...family.semibold, fontSize: 15, color: c.text }}>{roomTitle(r)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Sheet>
  );
}

/** 연락처 공유: 내 주소록에서 고르기 */
export function ContactSheet({ open, contacts, onClose, onPick }: { open: boolean; contacts: User[]; onClose: () => void; onPick: (u: User) => void }) {
  const c = useColors();
  return (
    <Sheet open={open} onClose={onClose}>
      <Text style={{ ...family.bold, fontSize: 18, color: c.text }}>연락처 보내기</Text>
      <ScrollView>
        {contacts.map((u) => (
          <Pressable
            key={u.id}
            onPress={() => {
              onPick(u);
              onClose();
            }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, opacity: pressed ? 0.5 : 1 })}>
            <Avatar name={u.nickname} size={40} uri={u.photo} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ ...family.semibold, fontSize: 15, color: c.text }}>{displayName(u)}</Text>
              {u.dept ? <Text style={{ ...family.regular, fontSize: 12, color: c.sub }}>{u.dept}</Text> : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Sheet>
  );
}

/** 상단 공지: 접힌 상태는 최신 1개, 펼치면 전체 */
export function NoticeBar({ room, me, users, onJump }: { room: Room; me: User; users: User[]; onJump: (messageId: string) => void }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const notices = room.notices ?? [];
  if (!notices.length || room.noticeHiddenBy?.includes(me.id)) return null;
  const shown = open ? notices : notices.slice(0, 1);
  return (
    <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: radius.md, backgroundColor: c.bg, paddingHorizontal: space.md, paddingVertical: space.sm, marginBottom: space.sm, gap: space.sm }}>
      {shown.map((n) => (
        <View key={n.id} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
          <Icon name="notice" color={c.accent} size={18} />
          <Pressable style={{ flex: 1 }} onPress={() => onJump(n.messageId)}>
            <Text numberOfLines={open ? 4 : 1} style={{ ...family.semibold, fontSize: 14, color: c.text }}>{n.text}</Text>
            {open ? <Text style={{ ...family.regular, fontSize: 12, color: c.faint }}>{nameOf(users, n.by)} · {chatTime(n.at)}</Text> : null}
          </Pressable>
          {open && (n.by === me.id || me.role === 'admin') ? (
            <Pressable accessibilityLabel="공지 내리기" hitSlop={8} onPress={() => actions.removeNotice(room.id, n.id)}>
              <Icon name="close" color={c.faint} size={16} />
            </Pressable>
          ) : null}
          {!open ? (
            <Pressable accessibilityLabel="공지 펼치기" hitSlop={8} onPress={() => setOpen(true)} style={{ transform: [{ rotate: '90deg' }] }}>
              <Icon name="chevron" color={c.faint} size={18} />
            </Pressable>
          ) : null}
        </View>
      ))}
      {open ? (
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.line, paddingTop: space.sm }}>
          <Pressable style={{ flex: 1, alignItems: 'center' }} onPress={() => actions.hideNotices(room.id)}>
            <Text style={{ ...family.semibold, fontSize: 14, color: c.sub }}>다시 보지 않기</Text>
          </Pressable>
          <Pressable style={{ flex: 1, alignItems: 'center' }} onPress={() => setOpen(false)}>
            <Text style={{ ...family.semibold, fontSize: 14, color: c.text }}>접기</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const NOTIFY: [NotifyLevel, string][] = [
  ['all', '모든 메시지'],
  ['mention', '멘션만'],
  ['off', '끄기'],
];

function DrawerHead({ title }: { title: string }) {
  const c = useColors();
  return <Text style={{ ...family.bold, fontSize: 15, color: c.text, marginTop: space.md }}>{title}</Text>;
}

/** 오른쪽 방 메뉴: 알림, 대화 중 멤버, 링크·문서, 새 메시지방, 나가기 */
export function RoomDrawer({
  open,
  onClose,
  room,
  me,
  users,
  messages,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  room: Room;
  me: User;
  users: User[];
  messages: Message[];
  onError: (text: string) => void;
}) {
  const c = useColors();
  const level = notifyLevel(room, me.id);
  const members = room.memberIds.map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
  const links = roomLinks(messages);
  const docs = room.caseInfo?.documents ?? [];
  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const leavable = room.kind !== 'case' && room.kind !== 'consult';
  // 마스터: 참여자 마스터 지정·해제, 내보내기 (상담·사건방은 내보내기 없음)
  const amMaster = isMaster(room, me.id);
  const kickable = leavable;
  const [manage, setManage] = useState<string>();
  const [rename, setRename] = useState<string>();
  const canRename = amMaster;
  const saveName = () => {
    const r = actions.renameRoom(room.id, rename ?? '');
    if (!r.ok) return onError(r.reason);
    setRename(undefined);
  };
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.35)' }}>
        <Pressable accessibilityLabel="메뉴 닫기" onPress={onClose} style={{ flex: 1 }} />
        <View style={{ width: '86%', maxWidth: 380, backgroundColor: c.bg }}>
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Avatar name={room.title} size={48} group={members.length > 2} />
              <Text numberOfLines={2} style={{ flex: 1, ...family.bold, fontSize: 17, color: c.text }}>{roomTitle(room)}</Text>
              <Pressable accessibilityLabel="메뉴 닫기" onPress={onClose} hitSlop={8}>
                <Icon name="close" color={c.text} size={22} />
              </Pressable>
            </View>
            {canRename ? (
              rename === undefined ? (
                <Pressable accessibilityLabel="방 이름 바꾸기" onPress={() => setRename(room.title)} hitSlop={6} style={{ alignSelf: 'flex-start' }}>
                  <Text style={{ ...family.semibold, fontSize: 13, color: c.accent }}>방 이름 바꾸기</Text>
                </Pressable>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <TextInput
                    accessibilityLabel="새 방 이름"
                    autoFocus
                    maxLength={30}
                    value={rename}
                    onChangeText={setRename}
                    onSubmitEditing={saveName}
                    style={{ flex: 1, backgroundColor: c.surface, color: c.text, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: space.sm, ...family.regular, fontSize: 15 }}
                  />
                  <Pressable accessibilityLabel="방 이름 저장" onPress={saveName} hitSlop={6}>
                    <Text style={{ ...family.semibold, fontSize: 14, color: c.accent }}>저장</Text>
                  </Pressable>
                  <Pressable accessibilityLabel="방 이름 바꾸기 취소" onPress={() => setRename(undefined)} hitSlop={6}>
                    <Text style={{ ...family.regular, fontSize: 14, color: c.sub }}>취소</Text>
                  </Pressable>
                </View>
              )
            ) : null}

            {me.role === 'admin' && !isSelfRoom(room, me.id) ? (
              <>
                <DrawerHead title="AI 참여 (어드민)" />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Text style={{ flex: 1, ...family.regular, fontSize: 13, color: c.sub }}>
                    {room.kind === 'case' || room.kind === 'consult' ? '사건방·상담방은 AI 참여를 켤 수 없습니다.' : room.mode === 'ai' ? '@AI로 부르면 AI가 최근 대화를 읽고 답합니다.' : 'AI가 이 방의 대화를 읽지 않습니다.'}
                  </Text>
                  <Switch
                    accessibilityLabel="AI 참여"
                    value={room.mode === 'ai'}
                    disabled={room.mode !== 'ai' && (room.kind === 'case' || room.kind === 'consult')}
                    onValueChange={(v) => {
                      const r = actions.setRoomAi(room.id, v);
                      if (!r.ok) onError(r.reason);
                    }}
                  />
                </View>
              </>
            ) : null}

            <DrawerHead title="알림" />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {NOTIFY.map(([k, label]) => (
                <Pressable
                  key={k}
                  onPress={() => actions.setNotify(room.id, k)}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: space.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: level === k ? c.accent : c.line, backgroundColor: level === k ? c.accentSoft : c.bg }}>
                  <Text style={{ ...family.semibold, fontSize: 13, color: level === k ? c.accent : c.sub }}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.md }}>
              <Text style={{ ...family.bold, fontSize: 15, color: c.text }}>대화 중 멤버 ({members.length})</Text>
              <Pressable
                accessibilityLabel="멤버 초대"
                onPress={go(() => router.push({ pathname: '/room/new', params: { roomId: room.id } }))}
                style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="plus" color={c.accent} size={18} />
                <Text style={{ ...family.semibold, fontSize: 14, color: c.accent }}>멤버 초대</Text>
              </Pressable>
            </View>
            {members.map((u) => (
              <View key={u.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Pressable
                    onPress={go(() => router.push({ pathname: '/contact/[id]', params: { id: u.id } }))}
                    style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 4, opacity: pressed ? 0.5 : 1 })}>
                    <Avatar name={u.nickname} size={34} uri={u.photo} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text numberOfLines={1} style={{ flexShrink: 1, ...family.semibold, fontSize: 14, color: c.text }}>
                          {displayName(u)}
                          {u.id === me.id ? ' (나)' : ''}
                        </Text>
                        {isMaster(room, u.id) ? (
                          <View style={{ backgroundColor: c.accentSoft, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 }}>
                            <Text style={{ ...family.bold, fontSize: 11, color: c.accent }}>마스터</Text>
                          </View>
                        ) : null}
                      </View>
                      {u.dept ? <Text numberOfLines={1} style={{ ...family.regular, fontSize: 12, color: c.sub }}>{u.dept}</Text> : null}
                    </View>
                  </Pressable>
                  {amMaster && u.id !== me.id ? (
                    <Pressable accessibilityLabel={`${u.nickname} 관리`} hitSlop={8} onPress={() => setManage((x) => (x === u.id ? undefined : u.id))} style={{ padding: 4 }}>
                      <Text style={{ ...family.bold, fontSize: 18, color: c.sub }}>⋯</Text>
                    </Pressable>
                  ) : null}
                </View>
                {manage === u.id ? (
                  <View style={{ flexDirection: 'row', gap: space.sm, paddingLeft: 42, paddingBottom: space.sm }}>
                    <SmallAction
                      label={isMaster(room, u.id) ? '마스터 해제' : '마스터로 지정'}
                      onPress={() => {
                        const r = actions.setMaster(room.id, u.id, !isMaster(room, u.id));
                        if (!r.ok) onError(r.reason);
                        setManage(undefined);
                      }}
                    />
                    {kickable ? (
                      <SmallAction
                        label="내보내기"
                        danger
                        onPress={() => {
                          const r = actions.kick(room.id, u.id);
                          if (!r.ok) onError(r.reason);
                          setManage(undefined);
                        }}
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
            ))}

            <DrawerHead title={`링크 (${links.length})`} />
            {links.length ? (
              links.map((l, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Icon name="link" color={c.sub} size={16} />
                  <Text numberOfLines={1} style={{ flex: 1, ...family.regular, fontSize: 13, color: c.text }}>{l.url}</Text>
                  <Text style={{ ...family.regular, fontSize: 12, color: c.faint }}>{chatTime(l.at)}</Text>
                </View>
              ))
            ) : (
              <Text style={{ ...family.regular, fontSize: 13, color: c.faint }}>없음</Text>
            )}
            {room.caseInfo ? (
              <>
                <DrawerHead title={`사건 서류 (${docs.length})`} />
                {docs.map((d) => (
                  <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Icon name="file" color={c.sub} size={16} />
                    <Text numberOfLines={1} style={{ flex: 1, ...family.regular, fontSize: 13, color: c.text }}>{d.name}</Text>
                  </View>
                ))}
              </>
            ) : null}

            <View style={{ borderTopWidth: 1, borderTopColor: c.line, marginTop: space.md, paddingTop: space.sm }}>
              <DrawerRow
                icon="chat"
                label="새 메시지방 만들기"
                onPress={go(() => {
                  const res = actions.startChat(room.memberIds.filter((x) => x !== me.id), members.length > 2 ? room.title : '');
                  if (res.ok && res.roomId) router.push({ pathname: '/room/[id]', params: { id: res.roomId } });
                  else if (!res.ok) onError(res.reason);
                })}
              />
              <DrawerRow icon="pin" label={room.pinnedBy?.includes(me.id) ? '대화방 고정 해제' : '대화방 고정'} onPress={() => actions.togglePin(room.id)} />
              {leavable ? (
                <DrawerRow
                  icon="exit"
                  label="나가기"
                  danger
                  onPress={go(() => {
                    const res = actions.leaveRoom(room.id);
                    if (res.ok) router.replace('/');
                    else onError(res.reason);
                  })}
                />
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DrawerRow({ icon, label, onPress, danger }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, opacity: pressed ? 0.5 : 1 })}>
      <Icon name={icon} color={danger ? c.accent : c.text} size={20} />
      <Text style={{ ...family.semibold, fontSize: 15, color: danger ? c.accent : c.text }}>{label}</Text>
    </Pressable>
  );
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const keyOf = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** 날짜로 대화 찾기: 대화가 있는 날만 고를 수 있습니다. */
export function CalendarSheet({ open, days, onClose, onPick }: { open: boolean; days: Set<string>; onClose: () => void; onPick: (day: string) => void }) {
  const c = useColors();
  const latest = [...days].sort().at(-1);
  const start = latest ? new Date(`${latest}T00:00:00`) : new Date();
  const [month, setMonth] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const [picked, setPicked] = useState<string | undefined>(latest);
  const first = new Date(month.y, month.m, 1).getDay();
  const count = new Date(month.y, month.m + 1, 0).getDate();
  const cells = [...Array(first).fill(0), ...Array.from({ length: count }, (_, i) => i + 1)];
  const sorted = [...days].sort();
  const monthKey = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`;
  const hasBefore = sorted.some((d) => d.slice(0, 7) < monthKey(month.y, month.m));
  const hasAfter = sorted.some((d) => d.slice(0, 7) > monthKey(month.y, month.m));
  const move = (delta: number) => setMonth(({ y, m }) => ({ y: m + delta < 0 ? y - 1 : m + delta > 11 ? y + 1 : y, m: (m + delta + 12) % 12 }));
  const NavBtn = ({ dir, enabled }: { dir: -1 | 1; enabled: boolean }) => (
    <Pressable
      accessibilityLabel={dir < 0 ? '이전 달' : '다음 달'}
      disabled={!enabled}
      onPress={() => move(dir)}
      style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: enabled ? c.line : 'transparent', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: dir < 0 ? '180deg' : '0deg' }] }}>
      <Icon name="chevron" color={enabled ? c.text : c.line} size={18} />
    </Pressable>
  );
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="닫기" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: space.lg }}>
        <Pressable onPress={() => undefined} style={{ width: '100%', maxWidth: 360, backgroundColor: c.bg, borderRadius: radius.lg, padding: space.lg, gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <NavBtn dir={-1} enabled={hasBefore} />
            <Text style={{ ...family.bold, fontSize: 18, color: c.text }}>
              {month.y}년 {month.m + 1}월
            </Text>
            <NavBtn dir={1} enabled={hasAfter} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {WEEK.map((w, i) => (
              <View key={w} style={{ width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 6 }}>
                <Text style={{ ...family.semibold, fontSize: 13, color: i === 0 ? c.accent : c.sub }}>{w}</Text>
              </View>
            ))}
            {cells.map((d, i) => {
              if (!d) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 42 }} />;
              const k = keyOf(month.y, month.m, d);
              const on = days.has(k);
              const sel = picked === k;
              return (
                <Pressable key={k} accessibilityLabel={`${month.m + 1}월 ${d}일`} disabled={!on} onPress={() => setPicked(k)} style={{ width: `${100 / 7}%`, height: 42, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? c.accent : 'transparent' }}>
                    <Text style={{ ...(on ? family.bold : family.regular), fontSize: 15, color: sel ? '#FFFFFF' : on ? c.text : c.line }}>{d}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space.xl }}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={{ ...family.semibold, fontSize: 16, color: c.sub }}>취소</Text>
            </Pressable>
            <Pressable
              hitSlop={8}
              disabled={!picked}
              onPress={() => {
                if (picked) onPick(picked);
                onClose();
              }}>
              <Text style={{ ...family.bold, fontSize: 16, color: c.accent }}>확인</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SmallAction({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: danger ? c.accent : c.line, opacity: pressed ? 0.5 : 1 })}>
      <Text style={{ ...family.semibold, fontSize: 13, color: danger ? c.accent : c.text }}>{label}</Text>
    </Pressable>
  );
}

/** 말풍선 안의 사진·파일. 누르면 크게 보거나 내려받습니다. 올리는 중에는 기기 안 사진을 그대로 보여 줍니다. */
function MessageFiles({ items, mine, title, boxed }: { items: Attachment[]; mine: boolean; title: string; boxed: boolean }) {
  const c = useColors();
  const images = items.filter((a) => a.kind === 'image');
  const videos = items.filter((a) => a.kind === 'file' && isVideo(a));
  const files = items.filter((a) => a.kind === 'file' && !isVideo(a));
  const fg = mine ? c.bubbleMineText : c.text;
  const one = images.length === 1;
  return (
    <View style={{ gap: space.xs, alignItems: mine ? 'flex-end' : 'flex-start' }}>
      {images.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, maxWidth: 236, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
          {images.map((a, i) => (
            <Pressable key={a.id} accessibilityLabel={`사진 ${a.name}`} onPress={() => openViewer(images, i, title)}>
              <Image source={a.uri ? { uri: a.uri } : undefined} resizeMode="cover" style={{ width: one ? 220 : 116, height: one ? 220 : 116, borderRadius: radius.md, backgroundColor: c.surface }} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {images.length === 1 ? <FileActions a={images[0]} color={mine && !boxed ? 'rgba(255,255,255,0.75)' : undefined} onOpen={() => openViewer(images, 0, title)} /> : null}
      {videos.map((a) => (
        <View key={a.id} style={{ gap: 2, alignItems: mine ? 'flex-end' : 'flex-start' }}>
          <VideoPlayer a={a} />
          <FileActions a={a} color={mine && !boxed ? 'rgba(255,255,255,0.75)' : undefined} />
        </View>
      ))}
      {files.map((a) => (
        <View key={a.id} style={{ gap: 2, alignItems: mine ? 'flex-end' : 'flex-start' }}>
          <View style={boxed ? { backgroundColor: mine ? c.bubbleMine : c.bubbleOther, borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.sm + 2 } : undefined}>
            <Pressable accessibilityLabel={`파일 ${a.name}`} onPress={() => openFile(a)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minWidth: 200, maxWidth: 236 }}>
              <Icon name="file" color={fg} size={22} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ ...family.semibold, fontSize: 14, color: fg }}>{a.name}</Text>
                {a.size ? <Text style={{ ...family.regular, fontSize: 12, color: mine ? c.bubbleMineText : c.sub }}>{fileSize(a.size)}</Text> : null}
              </View>
            </Pressable>
          </View>
          <FileActions a={a} color={mine && !boxed ? 'rgba(255,255,255,0.75)' : undefined} />
        </View>
      ))}
    </View>
  );
}

/** 동영상: 웹은 바로 재생, 폰 앱은 눌러서 엽니다 */
function VideoPlayer({ a }: { a: Attachment }) {
  const c = useColors();
  if (Platform.OS === 'web' && a.uri) {
    return createElement('video', { src: a.uri, controls: true, preload: 'metadata', style: { width: 236, maxHeight: 320, borderRadius: radius.md, backgroundColor: '#000' } });
  }
  return (
    <Pressable accessibilityLabel={`동영상 ${a.name}`} onPress={() => openFile(a)} style={{ width: 220, height: 140, borderRadius: radius.md, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <Text style={{ color: '#FFFFFF', fontSize: 30 }}>▶</Text>
      <Text numberOfLines={1} style={{ ...family.regular, fontSize: 12, color: c.faint, maxWidth: 200 }}>{a.name}</Text>
    </Pressable>
  );
}
