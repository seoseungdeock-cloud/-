// 파일함 — 회사 공용 · 내 부서 · 대화방별 파일 (네이버웍스 Drive 대응).
// 폴더는 '서식/소송' 처럼 이름표라서 파일을 올릴 때 정해지고, 비어 있으면 사라집니다.
// 대화방 탭에는 파일함에 올린 것과 대화에서 보낸 사진·파일이 함께 보입니다.
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { timeAgo } from '@/core/board';
import { isSelfRoom } from '@/core/calendar';
import type { Attachment, Room } from '@/core/types';
import { cleanFolder, fileSizeText, folderView, useWork, visibleFiles, work, type DriveFile } from '@/core/work';
import { openFile } from '@/ui/board';
import { Sheet } from '@/ui/chat';
import { roomTitle } from '@/ui/room-row';
import { Icon } from '@/ui/icons';
import { Avatar, Button, Empty, Input, Notice, Screen } from '@/ui/kit';
import { Appear } from '@/ui/motion';
import { SegmentBar } from '@/ui/segments';
import { family, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

type Tab = 'firm' | 'dept' | 'room';
const EXT_LABEL: Record<string, string> = { pdf: 'PDF', doc: 'DOC', docx: 'DOC', hwp: 'HWP', hwpx: 'HWP', xls: 'XLS', xlsx: 'XLS', ppt: 'PPT', pptx: 'PPT', zip: 'ZIP', jpg: 'IMG', jpeg: 'IMG', png: 'IMG', gif: 'IMG', mp4: 'MOV', mov: 'MOV', txt: 'TXT' };
const ext = (name: string) => /\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1].toLowerCase() ?? '';

export default function DriveScreen() {
  const { room: roomParam } = useLocalSearchParams<{ room?: string }>();
  const w = useWork();
  const s = useApp();
  const me = useMe();
  const c = useColors();
  const isFirm = me.role !== 'client';
  const [tab, setTab] = useState<Tab>(roomParam || !isFirm ? 'room' : 'firm');
  const [roomId, setRoomId] = useState<string | undefined>(roomParam);
  const [folder, setFolder] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [newFolder, setNewFolder] = useState<string>();
  const [editing, setEditing] = useState<DriveFile>();
  const myRooms = useMemo(() => s.rooms.filter((r) => r.memberIds.includes(me.id) && !isSelfRoom(r, me.id)), [s.rooms, me.id]);
  const visible = useMemo(() => visibleFiles(w.files, { id: me.id, dept: me.dept, firm: isFirm }, new Set(myRooms.map((r) => r.id))), [w.files, me, isFirm, myRooms]);
  const scoped = useMemo(() => visible.filter((f) => (tab === 'room' ? f.scope === 'room' && f.roomId === roomId : f.scope === tab && (tab !== 'dept' || f.dept === me.dept))), [visible, tab, roomId, me.dept]);
  const view = useMemo(() => folderView(scoped, folder), [scoped, folder]);
  const room = roomId ? s.rooms.find((r) => r.id === roomId) : undefined;
  // 대화에서 보낸 사진·파일 (방 탭에서만)
  const chatFiles = useMemo(() => (room ? s.messages.filter((m) => m.roomId === room.id && !m.recalled && m.attachments?.length).flatMap((m) => (m.attachments ?? []).map((a) => ({ a, at: m.at, by: m.senderId }))).sort((x, y) => y.at.localeCompare(x.at)) : []), [s.messages, room]);
  const crumbs = cleanFolder(folder).split('/').filter(Boolean);
  const report = (r: { ok: boolean; reason?: string }) => setError(r.ok ? undefined : r.reason);
  const canUpload = isFirm && (tab !== 'room' || !!room) && (tab !== 'dept' || !!me.dept);

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (res.canceled || !res.assets.length) return;
    setBusy(true);
    setError(undefined);
    for (const a of res.assets) {
      const r = await work.uploadFile({ scope: tab, dept: tab === 'dept' ? me.dept : undefined, roomId: tab === 'room' ? roomId : undefined, folder, name: a.name, uri: a.uri, size: a.size, mime: a.mimeType });
      if (!r.ok) { setError(r.reason); break; }
    }
    setBusy(false);
  };
  const open = async (f: DriveFile) => {
    const url = await work.fileUrl(f.id);
    if (!url) { setError('파일 주소를 받지 못했습니다.'); return; }
    if (Platform.OS === 'web') {
      const link = document.createElement('a');
      link.href = url;
      link.download = f.name;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } else void Linking.openURL(url);
  };
  const switchTab = (t: Tab) => { setTab(t); setFolder(''); setNewFolder(undefined); if (t !== 'room') setRoomId(undefined); };
  const title = tab === 'room' && room ? roomTitle(room) : '파일함';

  return (
    <Screen
      title={title}
      back
      right={canUpload ? <Button small label={busy ? '올리는 중…' : '올리기'} icon="plus" disabled={busy} onPress={() => void pick()} /> : undefined}>
      {editing ? <FileEditor f={editing} onClose={() => setEditing(undefined)} report={report} /> : null}
      {isFirm ? (
        <View style={{ marginBottom: space.md }}>
          <SegmentBar items={[['firm', '회사 공용'], ['dept', me.dept ? `내 부서` : '부서'], ['room', '대화방']]} value={tab} onChange={switchTab} />
        </View>
      ) : null}
      {error ? <Notice text={error} tone="warn" /> : null}
      {tab === 'dept' && !me.dept ? <Empty text="소속 부서가 없어 부서 파일함을 쓸 수 없습니다." /> : null}
      {tab === 'room' && !room ? (
        <RoomPicker rooms={myRooms} files={visible} messages={s.messages} onPick={(id) => { setRoomId(id); setFolder(''); }} />
      ) : tab === 'dept' && !me.dept ? null : (
        <>
          {/* 경로 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: c.line }}>
            {tab === 'room' ? (
              <Pressable onPress={() => { setRoomId(undefined); setFolder(''); }} hitSlop={8}><Text style={{ ...family.regular, fontSize: 14, color: c.faint }}>대화방</Text></Pressable>
            ) : null}
            {tab === 'room' ? <Icon name="chevron" color={c.faint} size={14} /> : null}
            <Pressable onPress={() => setFolder('')} hitSlop={8}>
              <Text style={{ ...(crumbs.length ? family.regular : family.bold), fontSize: 14, color: crumbs.length ? c.faint : c.text }}>{tab === 'firm' ? '회사 공용' : tab === 'dept' ? me.dept : '파일함'}</Text>
            </Pressable>
            {crumbs.map((name, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="chevron" color={c.faint} size={14} />
                <Pressable onPress={() => setFolder(crumbs.slice(0, i + 1).join('/'))} hitSlop={8}>
                  <Text style={{ ...(i === crumbs.length - 1 ? family.bold : family.regular), fontSize: 14, color: i === crumbs.length - 1 ? c.text : c.faint }}>{name}</Text>
                </Pressable>
              </View>
            ))}
            {canUpload ? (
              <Pressable accessibilityLabel="새 폴더" onPress={() => setNewFolder(newFolder === undefined ? '' : undefined)} hitSlop={8} style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="folder" color={c.accent} size={16} />
                <Text style={{ ...family.semibold, fontSize: 13, color: c.accent }}>새 폴더</Text>
              </Pressable>
            ) : null}
          </View>
          {newFolder !== undefined ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm }}>
              <View style={{ flex: 1 }}>
                <Input value={newFolder} onChangeText={setNewFolder} placeholder="폴더 이름 (예: 서식)" autoFocus onSubmitEditing={() => { const n = cleanFolder(newFolder); if (n) { setFolder(cleanFolder(`${folder}/${n}`)); setNewFolder(undefined); } }} />
              </View>
              <Button small label="열기" onPress={() => { const n = cleanFolder(newFolder); if (n) { setFolder(cleanFolder(`${folder}/${n}`)); setNewFolder(undefined); } }} />
            </View>
          ) : null}
          {/* 하위 폴더 */}
          {view.folders.map((name, i) => (
            <Appear key={`d:${name}`} index={i}>
              <Pressable onPress={() => setFolder(cleanFolder(`${folder}/${name}`))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
                <View style={{ width: 40, height: 40, borderRadius: radius.sm + 2, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="folder" color={c.accent} size={20} />
                </View>
                <Text numberOfLines={1} style={{ flex: 1, ...family.semibold, fontSize: 15, color: c.text }}>{name}</Text>
                <Text style={{ ...family.regular, fontSize: 13, color: c.faint }}>{scoped.filter((f) => f.folder === cleanFolder(`${folder}/${name}`) || f.folder.startsWith(`${cleanFolder(`${folder}/${name}`)}/`)).length}</Text>
                <Icon name="chevron" color={c.faint} size={16} />
              </Pressable>
            </Appear>
          ))}
          {/* 파일 */}
          {view.files.map((f, i) => (
            <Appear key={f.id} index={view.folders.length + i}>
              <FileRow f={f} by={s.users.find((u) => u.id === f.uploaderId)?.nickname} onOpen={() => void open(f)} onMore={f.uploaderId === me.id ? () => setEditing(f) : undefined} />
            </Appear>
          ))}
          {!view.folders.length && !view.files.length && !(tab === 'room' && chatFiles.length) ? (
            <Empty icon="folder" text={crumbs.length ? '이 폴더는 비어 있습니다.' : '아직 올린 파일이 없습니다.'} hint={canUpload ? '오른쪽 위 「올리기」로 파일을 올려 두면 같은 범위 사람이 함께 봅니다.' : undefined} />
          ) : null}
          {tab === 'room' && chatFiles.length ? (
            <View style={{ marginTop: space.lg }}>
              <Text style={{ ...family.bold, fontSize: 15, color: c.text, marginBottom: space.xs }}>대화에서 보낸 사진·파일 ({chatFiles.length})</Text>
              {chatFiles.map(({ a, at, by }) => (
                <ChatFileRow key={a.id} a={a} at={at} by={s.users.find((u) => u.id === by)?.nickname} />
              ))}
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function FileBadge({ name }: { name: string }) {
  const c = useColors();
  const e = ext(name);
  return (
    <View style={{ width: 40, height: 40, borderRadius: radius.sm + 2, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ ...family.bold, fontSize: 11, color: c.sub }}>{EXT_LABEL[e] ?? (e ? e.toUpperCase().slice(0, 4) : 'FILE')}</Text>
    </View>
  );
}

function FileRow({ f, by, onOpen, onMore }: { f: DriveFile; by?: string; onOpen: () => void; onMore?: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityLabel={`파일 ${f.name}`} onPress={onOpen} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
      <FileBadge name={f.name} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ ...family.semibold, fontSize: 15, color: c.text }}>{f.name}</Text>
        <Text numberOfLines={1} style={{ ...family.regular, fontSize: 13, color: c.faint, marginTop: 2 }}>{[fileSizeText(f.size), by, timeAgo(f.createdAt)].filter(Boolean).join(' · ')}</Text>
      </View>
      {onMore ? (
        <Pressable accessibilityLabel="파일 관리" onPress={onMore} hitSlop={10}><Text style={{ ...family.bold, fontSize: 18, color: c.sub }}>⋯</Text></Pressable>
      ) : (
        <Icon name="download" color={c.faint} size={18} />
      )}
    </Pressable>
  );
}

function ChatFileRow({ a, at, by }: { a: Attachment; at: string; by?: string }) {
  const c = useColors();
  return (
    <Pressable accessibilityLabel={`파일 ${a.name}`} onPress={() => openFile(a)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
      <FileBadge name={a.name} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ ...family.semibold, fontSize: 15, color: c.text }}>{a.name}</Text>
        <Text numberOfLines={1} style={{ ...family.regular, fontSize: 13, color: c.faint, marginTop: 2 }}>{[a.size ? fileSizeText(a.size) : '', by, timeAgo(at)].filter(Boolean).join(' · ')}</Text>
      </View>
      <Icon name="chevron" color={c.faint} size={16} />
    </Pressable>
  );
}

/** 대화방 고르기: 파일이 있는 방이 위로 */
function RoomPicker({ rooms, files, messages, onPick }: { rooms: Room[]; files: DriveFile[]; messages: { roomId: string; recalled?: boolean; attachments?: Attachment[] }[]; onPick: (id: string) => void }) {
  const c = useColors();
  const count = (r: Room) => files.filter((f) => f.scope === 'room' && f.roomId === r.id).length + messages.filter((m) => m.roomId === r.id && !m.recalled).reduce((n, m) => n + (m.attachments?.length ?? 0), 0);
  const list = rooms.map((r) => ({ r, n: count(r) })).sort((a, b) => b.n - a.n || roomTitle(a.r).localeCompare(roomTitle(b.r), 'ko'));
  if (!list.length) return <Empty text="참여 중인 대화방이 없습니다." />;
  return (
    <View>
      {list.map(({ r, n }, i) => (
        <Appear key={r.id} index={i}>
          <Pressable onPress={() => onPick(r.id)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
            <Avatar name={roomTitle(r)} size={40} uri={r.photo} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ ...family.semibold, fontSize: 15, color: c.text }}>{roomTitle(r)}</Text>
              <Text style={{ ...family.regular, fontSize: 13, color: c.faint, marginTop: 2 }}>{n ? `파일 ${n}개` : '파일 없음'}</Text>
            </View>
            <Icon name="chevron" color={c.faint} size={16} />
          </Pressable>
        </Appear>
      ))}
    </View>
  );
}

/** 이름·폴더 바꾸기 / 지우기 (올린 사람) */
function FileEditor({ f, onClose, report }: { f: DriveFile; onClose: () => void; report: (r: { ok: boolean; reason?: string }) => void }) {
  const c = useColors();
  const [name, setName] = useState(f.name);
  const [folder, setFolder] = useState(f.folder);
  const [confirm, setConfirm] = useState(false);
  return (
    <Sheet open onClose={onClose}>
      <Text style={{ ...family.bold, fontSize: 18, color: c.text, marginBottom: space.md }}>파일 관리</Text>
      <View style={{ gap: space.md }}>
        <Input label="이름" value={name} onChangeText={setName} />
        <Input label="폴더 (예: 서식/소송 — 비우면 맨 위)" value={folder} onChangeText={setFolder} />
        <Button label="저장" onPress={() => void work.moveFile(f.id, { name, folder }).then((r) => { report(r); if (r.ok) onClose(); })} />
        {confirm ? (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}><Button label="취소" kind="plain" onPress={() => setConfirm(false)} /></View>
            <View style={{ flex: 1 }}><Button label="정말 지우기" kind="dark" onPress={() => void work.deleteFile(f.id).then((r) => { report(r); onClose(); })} /></View>
          </View>
        ) : (
          <Button label="지우기" kind="plain" onPress={() => setConfirm(true)} />
        )}
      </View>
    </Sheet>
  );
}

