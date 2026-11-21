// 파일함 — 회사 공용 · 내 부서 · 대화방별 파일 (네이버웍스 Drive 대응).
// 폴더는 '서식/소송' 처럼 이름표라서 파일을 올릴 때 정해지고, 비어 있으면 사라집니다.
// 대화방 탭에는 파일함에 올린 것과 대화에서 보낸 사진·파일이 함께 보입니다.
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { timeAgo } from '@/core/board';
import { isSelfRoom, todayKst } from '@/core/calendar';
import type { Attachment, Room } from '@/core/types';
import { cleanFolder, fileSizeText, folderView, trashFiles, TRASH_DAYS, useWork, visibleFiles, work, type DriveFile, type DriveLink } from '@/core/work';
import { openFile } from '@/ui/board';
import { Sheet } from '@/ui/chat';
import { roomTitle } from '@/ui/room-row';
import { Icon } from '@/ui/icons';
import { Avatar, Button, Empty, Input, Notice, Screen } from '@/ui/kit';
import { Appear } from '@/ui/motion';
import { SegmentBar } from '@/ui/segments';
import { family, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

type Tab = 'firm' | 'dept' | 'room' | 'trash';
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
  const trash = useMemo(() => trashFiles(w.files, me.id, me.role === 'admin'), [w.files, me.id, me.role]);
  const scoped = useMemo(() => visible.filter((f) => (tab === 'room' ? f.scope === 'room' && f.roomId === roomId : f.scope === tab && (tab !== 'dept' || f.dept === me.dept))), [visible, tab, roomId, me.dept]);
  const view = useMemo(() => folderView(scoped, folder), [scoped, folder]);
  const room = roomId ? s.rooms.find((r) => r.id === roomId) : undefined;
  // 대화에서 보낸 사진·파일 (방 탭에서만)
  const chatFiles = useMemo(() => (room ? s.messages.filter((m) => m.roomId === room.id && !m.recalled && m.attachments?.length).flatMap((m) => (m.attachments ?? []).map((a) => ({ a, at: m.at, by: m.senderId }))).sort((x, y) => y.at.localeCompare(x.at)) : []), [s.messages, room]);
  const crumbs = cleanFolder(folder).split('/').filter(Boolean);
  const nowIso = `${todayKst()}T00:00:00Z`;
  const report = (r: { ok: boolean; reason?: string }) => setError(r.ok ? undefined : r.reason);
  const canUpload = isFirm && tab !== 'trash' && (tab !== 'room' || !!room) && (tab !== 'dept' || !!me.dept);

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (res.canceled || !res.assets.length) return;
    setBusy(true);
    setError(undefined);
    for (const a of res.assets) {
      if (tab === 'trash') return;
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
  const title = tab === 'trash' ? '휴지통' : tab === 'room' && room ? roomTitle(room) : '파일함';

  return (
    <Screen
      title={title}
      back
      right={canUpload ? <Button small label={busy ? '올리는 중…' : '올리기'} icon="plus" disabled={busy} onPress={() => void pick()} /> : undefined}>
      {editing ? <FileEditor f={editing} onClose={() => setEditing(undefined)} report={report} /> : null}
      {isFirm ? (
        <View style={{ marginBottom: space.md }}>
          <SegmentBar items={[['firm', '회사 공용'], ['dept', me.dept ? `내 부서` : '부서'], ['room', '대화방'], ['trash', trash.length ? `휴지통 ${trash.length}` : '휴지통']]} value={tab} onChange={switchTab} />
        </View>
      ) : null}
      {error ? <Notice text={error} tone="warn" /> : null}
      {tab === 'dept' && !me.dept ? <Empty text="소속 부서가 없어 부서 파일함을 쓸 수 없습니다." /> : null}
      {tab === 'trash' ? (
        <TrashList files={trash} users={s.users} report={report} />
      ) : tab === 'room' && !room ? (
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
              <FileRow f={f} by={s.users.find((u) => u.id === f.uploaderId)?.nickname} linked={w.links.some((l) => l.fileId === f.id && !l.revokedAt && (!l.expiresAt || l.expiresAt > nowIso))} onOpen={() => void open(f)} onMore={f.uploaderId === me.id || me.role === 'admin' ? () => setEditing(f) : undefined} />
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

function FileRow({ f, by, linked, onOpen, onMore }: { f: DriveFile; by?: string; linked?: boolean; onOpen: () => void; onMore?: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityLabel={`파일 ${f.name}`} onPress={onOpen} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
      <FileBadge name={f.name} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, ...family.semibold, fontSize: 15, color: c.text }}>{f.name}</Text>
          {linked ? <Icon name="link" color={c.accent} size={14} /> : null}
        </View>
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

/** 휴지통: 되살리기 · 바로 지우기. 30일 지나면 자동 삭제 */
function TrashList({ files, users, report }: { files: DriveFile[]; users: { id: string; nickname: string }[]; report: (r: { ok: boolean; reason?: string }) => void }) {
  const c = useColors();
  // 남은 날수는 오늘(한국 날짜) 기준으로 계산
  const today = todayKst();
  const daysLeft = (f: DriveFile) => Math.max(0, TRASH_DAYS - Math.floor((new Date(`${today}T00:00:00Z`).getTime() - new Date(f.deletedAt!.slice(0, 10) + 'T00:00:00Z').getTime()) / 86_400_000));
  if (!files.length) return <Empty icon="trash" text="휴지통이 비어 있습니다." hint={`지운 파일은 ${TRASH_DAYS}일 동안 여기에 있다가 자동으로 지워집니다.`} />;
  return (
    <View>
      <Text style={{ ...family.regular, fontSize: 13, color: c.faint, paddingVertical: space.sm }}>지운 파일은 {TRASH_DAYS}일 뒤 자동으로 지워집니다. 되살리면 원래 자리로 돌아갑니다.</Text>
      {files.map((f, i) => (
        <Appear key={f.id} index={i}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10 }}>
            <FileBadge name={f.name} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ ...family.semibold, fontSize: 15, color: c.text }}>{f.name}</Text>
              <Text numberOfLines={1} style={{ ...family.regular, fontSize: 13, color: c.faint, marginTop: 2 }}>{[fileSizeText(f.size), users.find((u) => u.id === f.uploaderId)?.nickname, f.folder ? `폴더 ${f.folder}` : '', `${daysLeft(f)}일 뒤 삭제`].filter(Boolean).join(' · ')}</Text>
            </View>
            <Button small label="되살리기" kind="soft" onPress={() => void work.restoreFile(f.id).then(report)} />
            <Pressable accessibilityLabel="바로 지우기" hitSlop={8} onPress={() => void work.purgeFile(f.id).then(report)}><Icon name="trash" color={c.faint} size={18} /></Pressable>
          </View>
        </Appear>
      ))}
    </View>
  );
}

/** 이름·폴더 바꾸기 / 링크 공유 / 휴지통으로 (올린 사람·어드민) */
function FileEditor({ f, onClose, report }: { f: DriveFile; onClose: () => void; report: (r: { ok: boolean; reason?: string }) => void }) {
  const c = useColors();
  const w = useWork();
  const [name, setName] = useState(f.name);
  const [folder, setFolder] = useState(f.folder);
  const [confirm, setConfirm] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [access, setAccess] = useState<'anyone' | 'firm'>('anyone');
  const [permission, setPermission] = useState<'preview' | 'download'>('download');
  const [days, setDays] = useState<number>(7);
  const [pw, setPw] = useState('');
  const [made, setMade] = useState<string>();
  const [copied, setCopied] = useState(false);
  const links = w.links.filter((l) => l.fileId === f.id && !l.revokedAt);
  const copy = async (url: string) => { await Clipboard.setStringAsync(url); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const makeLink = async () => {
    const r = await work.createLink(f.id, { access, permission, expiresAt: days ? new Date(Date.now() + days * 86_400_000).toISOString() : undefined, password: pw.trim() || undefined });
    report(r);
    if (r.ok && r.url) { setMade(r.url); void copy(r.url); }
  };
  const linkLine = (l: DriveLink) => [l.access === 'firm' ? '구성원만' : '누구나', l.permission === 'preview' ? '보기만' : '내려받기', l.expiresAt ? `${new Date(l.expiresAt).toLocaleDateString('ko-KR')}까지` : '무기한', l.hasPassword ? '비밀번호' : '', `열람 ${l.hits}회`].filter(Boolean).join(' · ');
  return (
    <Sheet open onClose={onClose}>
      <Text style={{ ...family.bold, fontSize: 18, color: c.text, marginBottom: space.md }}>파일 관리</Text>
      <View style={{ gap: space.md }}>
        <Input label="이름" value={name} onChangeText={setName} />
        <Input label="폴더 (예: 서식/소송 — 비우면 맨 위)" value={folder} onChangeText={setFolder} />
        <Button label="저장" onPress={() => void work.moveFile(f.id, { name, folder }).then((r) => { report(r); if (r.ok) onClose(); })} />
        <View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: space.md, gap: space.sm }}>
          <Pressable onPress={() => setLinkOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="link" color={c.accent} size={16} />
            <Text style={{ ...family.semibold, fontSize: 14, color: c.accent }}>외부 링크로 공유{links.length ? ` · 링크 ${links.length}개` : ''}</Text>
          </Pressable>
          {links.map((l) => (
            <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Text style={{ flex: 1, ...family.regular, fontSize: 12.5, color: c.sub }}>{linkLine(l)}</Text>
              <Pressable accessibilityLabel="링크 끄기" hitSlop={8} onPress={() => void work.revokeLink(l.id).then(report)}><Text style={{ ...family.semibold, fontSize: 12.5, color: c.warn }}>끄기</Text></Pressable>
            </View>
          ))}
          {linkOpen ? (
            <View style={{ gap: space.sm, backgroundColor: c.surface, borderRadius: radius.md, padding: space.md }}>
              <Text style={{ ...family.regular, fontSize: 12.5, color: c.faint }}>링크를 아는 사람이 로그인 없이 받을 수 있습니다. 토큰은 지금 한 번만 보이니 바로 복사해 두세요. 열 때마다 감사 기록이 남습니다.</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {([['anyone', '누구나'], ['firm', '구성원만']] as const).map(([k, l]) => <Pressable key={k} onPress={() => setAccess(k)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: access === k ? c.text : c.bg }}><Text style={{ ...family.semibold, fontSize: 12.5, color: access === k ? c.bg : c.sub }}>{l}</Text></Pressable>)}
                {([['download', '내려받기'], ['preview', '보기만']] as const).map(([k, l]) => <Pressable key={k} onPress={() => setPermission(k)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: permission === k ? c.text : c.bg }}><Text style={{ ...family.semibold, fontSize: 12.5, color: permission === k ? c.bg : c.sub }}>{l}</Text></Pressable>)}
                {[[1, '1일'], [7, '7일'], [30, '30일'], [0, '무기한']].map(([d, l]) => <Pressable key={d} onPress={() => setDays(d as number)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: days === d ? c.text : c.bg }}><Text style={{ ...family.semibold, fontSize: 12.5, color: days === d ? c.bg : c.sub }}>{l}</Text></Pressable>)}
              </View>
              <Input placeholder="비밀번호 (선택, 4~16자)" value={pw} onChangeText={setPw} autoCapitalize="none" />
              {made ? (
                <Pressable onPress={() => void copy(made)} style={{ backgroundColor: c.bg, borderRadius: radius.sm, padding: space.sm }}>
                  <Text selectable numberOfLines={2} style={{ ...family.regular, fontSize: 12, color: c.text }}>{made}</Text>
                  <Text style={{ ...family.semibold, fontSize: 12, color: c.accent, marginTop: 4 }}>{copied ? '복사됨 ✓' : '눌러서 복사'}</Text>
                </Pressable>
              ) : null}
              <Button small label="링크 만들기" onPress={() => void makeLink()} />
            </View>
          ) : null}
        </View>
        {confirm ? (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}><Button label="취소" kind="plain" onPress={() => setConfirm(false)} /></View>
            <View style={{ flex: 1 }}><Button label="휴지통으로" kind="dark" onPress={() => void work.deleteFile(f.id).then((r) => { report(r); onClose(); })} /></View>
          </View>
        ) : (
          <Button label="지우기 (휴지통으로)" kind="plain" onPress={() => setConfirm(true)} />
        )}
      </View>
    </Sheet>
  );
}

