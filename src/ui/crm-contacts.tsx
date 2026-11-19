// 고객·거래처 연락처 — 주소록 '외부 연락처' 탭 안. 내 것 / 회사 공용, 태그로 분류, 검색.
import { useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { searchContacts, useWork, work, type Contact } from '@/core/work';
import { Sheet } from '@/ui/chat';
import { Icon } from '@/ui/icons';
import { Avatar, Badge, Button, Chip, Chips, Empty, Input, Notice, Sub, T } from '@/ui/kit';
import { Appear, Press } from '@/ui/motion';
import { family, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

export function CrmContacts({ query }: { query: string }) {
  const w = useWork();
  const me = useMe();
  const c = useColors();
  const [tag, setTag] = useState<string>();
  const [editor, setEditor] = useState<{ open: boolean; initial?: Contact }>({ open: false });
  const [open, setOpen] = useState<Contact>();
  const list = useMemo(() => searchContacts(w.contacts, query, tag), [w.contacts, query, tag]);
  const tags = useMemo(() => [...new Set(w.contacts.flatMap((x) => x.tags))].sort((a, b) => a.localeCompare(b, 'ko')), [w.contacts]);
  return (
    <View style={{ marginTop: space.md }}>
      {editor.open ? <ContactEditor initial={editor.initial} onClose={() => setEditor({ open: false })} /> : null}
      {open ? <ContactDetail contact={open} onClose={() => setOpen(undefined)} onEdit={(x) => { setOpen(undefined); setEditor({ open: true, initial: x }); }} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm }}>
        <Text style={{ ...family.semibold, fontSize: 13, color: c.faint }}>고객·거래처 {list.length}</Text>
        <View style={{ marginLeft: 'auto' }}><Button small kind="soft" label="연락처 추가" icon="plus" onPress={() => setEditor({ open: true })} /></View>
      </View>
      {tags.length ? (
        <Chips>
          <Chip label="전체" active={!tag} onPress={() => setTag(undefined)} />
          {tags.map((t) => <Chip key={t} label={t} active={tag === t} onPress={() => setTag(tag === t ? undefined : t)} />)}
        </Chips>
      ) : null}
      {list.length ? list.map((x, i) => (
        <Appear key={x.id} index={i}>
          <Press onPress={() => setOpen(x)} scale={0.985} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 9, paddingHorizontal: space.sm, marginHorizontal: -space.sm, borderRadius: radius.md, backgroundColor: hovered ? c.hover : 'transparent' })}>
            <Avatar name={x.name} size={38} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text numberOfLines={1} style={{ ...family.semibold, fontSize: 14.5, color: c.text }}>{x.name}{x.title ? <Text style={{ ...family.regular, color: c.sub }}> {x.title}</Text> : null}</Text>
                {x.shared ? <Badge label="공용" tone="plain" /> : null}
              </View>
              <Text numberOfLines={1} style={{ ...family.regular, fontSize: 12.5, color: c.sub, marginTop: 1 }}>{[x.company, x.phone, x.email].filter(Boolean).join(' · ')}</Text>
            </View>
            {x.tags.length ? <Text style={{ ...family.regular, fontSize: 11, color: c.faint }}>{x.tags.slice(0, 2).join(' · ')}</Text> : null}
          </Press>
        </Appear>
      )) : <Empty text={query || tag ? '맞는 연락처가 없습니다.' : '고객·거래처 연락처가 없습니다.'} hint="보험사·법원·감정기관처럼 자주 연락하는 바깥 사람을 넣어 두면 모두가 찾을 수 있습니다." />}
      <View style={{ height: space.lg }} />
      <Text style={{ ...family.semibold, fontSize: 13, color: c.faint, marginBottom: 4 }}>사건방의 의뢰인</Text>
    </View>
  );
}

function ContactDetail({ contact: x, onClose, onEdit }: { contact: Contact; onClose: () => void; onEdit: (c: Contact) => void }) {
  const me = useMe();
  const s = useApp();
  const c = useColors();
  const owner = s.users.find((u) => u.id === x.ownerId);
  const call = (tel: string) => void Linking.openURL(`tel:${tel.replace(/[^+\d]/g, '')}`);
  const mail = (addr: string) => void Linking.openURL(`mailto:${addr}`);
  const copy = (t: string) => { if (Platform.OS === 'web') void navigator.clipboard?.writeText(t); };
  return (
    <Sheet open onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar name={x.name} size={48} />
        <View style={{ flex: 1 }}>
          <T size="h3" bold>{x.name}</T>
          <Sub>{[x.title, x.company].filter(Boolean).join(' · ') || '소속 없음'}</Sub>
        </View>
        {x.shared ? <Badge label="회사 공용" tone="plain" /> : <Badge label="내 연락처" tone="plain" />}
      </View>
      <View style={{ gap: 8, marginTop: space.md }}>
        {x.phone ? <Row icon="phone" text={x.phone} onPress={() => call(x.phone!)} onLong={() => copy(x.phone!)} /> : null}
        {x.email ? <Row icon="mail" text={x.email} onPress={() => mail(x.email!)} onLong={() => copy(x.email!)} /> : null}
        {x.memo ? <Row icon="board" text={x.memo} /> : null}
      </View>
      {x.tags.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.md }}>{x.tags.map((t) => <Badge key={t} label={t} tone="plain" />)}</View> : null}
      <Text style={{ ...family.regular, fontSize: 12, color: c.faint, marginTop: space.md }}>{owner?.nickname ?? ''} 님이 등록</Text>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
        {x.ownerId === me.id ? <View style={{ flex: 1 }}><Button label="지우기" kind="plain" onPress={() => void work.deleteContact(x.id).then(onClose)} /></View> : null}
        {x.ownerId === me.id || x.shared ? <View style={{ flex: 2 }}><Button label="고치기" onPress={() => onEdit(x)} /></View> : <View style={{ flex: 2 }}><Button label="닫기" kind="plain" onPress={onClose} /></View>}
      </View>
    </Sheet>
  );
}

function Row({ icon, text, onPress, onLong }: { icon: 'phone' | 'mail' | 'board'; text: string; onPress?: () => void; onLong?: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} onLongPress={onLong} disabled={!onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, opacity: pressed ? 0.6 : 1 })}>
      <Icon name={icon} color={c.faint} size={16} />
      <Text selectable style={{ flex: 1, ...family.regular, fontSize: 15, color: onPress ? c.accent : c.text, lineHeight: 22 }}>{text}</Text>
    </Pressable>
  );
}

function ContactEditor({ initial, onClose }: { initial?: Contact; onClose: () => void }) {
  const [f, setF] = useState({ name: initial?.name ?? '', company: initial?.company ?? '', title: initial?.title ?? '', phone: initial?.phone ?? '', email: initial?.email ?? '', memo: initial?.memo ?? '', tags: initial?.tags.join(', ') ?? '', shared: initial?.shared ?? true });
  const [error, setError] = useState<string>();
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const submit = async () => {
    const r = await work.saveContact({ id: initial?.id, name: f.name, company: f.company.trim() || undefined, title: f.title.trim() || undefined, phone: f.phone.trim() || undefined, email: f.email.trim() || undefined, memo: f.memo.trim() || undefined, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean), shared: f.shared });
    if (!r.ok) return setError(r.reason);
    onClose();
  };
  return (
    <Sheet open onClose={onClose}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <T size="h3" bold>{initial ? '연락처 고치기' : '고객·거래처 연락처'}</T>
        <View style={{ height: space.md }} />
        <Input placeholder="이름" value={f.name} onChangeText={set('name')} autoFocus />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1.5 }}><Input placeholder="회사·기관" value={f.company} onChangeText={set('company')} /></View>
          <View style={{ flex: 1 }}><Input placeholder="직함" value={f.title} onChangeText={set('title')} /></View>
        </View>
        <Input placeholder="전화번호" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
        <Input placeholder="이메일" value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
        <Input placeholder="태그 (쉼표로 구분: 보험사, 교통사고)" value={f.tags} onChangeText={set('tags')} />
        <Input placeholder="메모" value={f.memo} onChangeText={set('memo')} multiline />
        <Chips>
          <Chip label="회사 공용" active={f.shared} onPress={() => setF((x) => ({ ...x, shared: true }))} />
          <Chip label="나만 보기" active={!f.shared} onPress={() => setF((x) => ({ ...x, shared: false }))} />
        </Chips>
        {error ? <Notice text={error} /> : null}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}><Button label="취소" kind="plain" onPress={onClose} /></View>
          <View style={{ flex: 2 }}><Button label={initial ? '저장' : '추가'} onPress={() => void submit()} /></View>
        </View>
      </ScrollView>
    </Sheet>
  );
}
