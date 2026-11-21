// 고객·거래처 연락처 — 주소록 '외부 연락처' 탭 안. 내 것 / 회사 공용, 태그로 분류, 검색.
import { useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { orgGroups } from '@/core/messenger';
import { canSeeContact, primaryEmail, primaryPhone, searchContacts, useWork, work, type Contact, type PhoneKind } from '@/core/work';
import { Sheet } from '@/ui/chat';
import { Icon } from '@/ui/icons';
import { Avatar, Badge, Button, Chip, Chips, Empty, Input, Notice, Sub, T } from '@/ui/kit';
import { Appear, Press } from '@/ui/motion';
import { family, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

const PHONE_KIND: [PhoneKind, string][] = [['cell', '휴대폰'], ['work', '회사'], ['home', '집'], ['fax', '팩스'], ['other', '기타']];
const kindLabel = (k: PhoneKind) => PHONE_KIND.find(([x]) => x === k)?.[1] ?? '기타';

export function CrmContacts({ query }: { query: string }) {
  const w = useWork();
  const me = useMe();
  const c = useColors();
  const [tag, setTag] = useState<string>();
  const [editor, setEditor] = useState<{ open: boolean; initial?: Contact }>({ open: false });
  const [open, setOpen] = useState<Contact>();
  const visible = useMemo(() => w.contacts.filter((x) => canSeeContact(x, { id: me.id, dept: me.dept, firm: me.role !== 'client' })), [w.contacts, me]);
  const list = useMemo(() => searchContacts(visible, query, tag), [visible, query, tag]);
  const tags = useMemo(() => [...new Set(visible.flatMap((x) => x.tags))].sort((a, b) => a.localeCompare(b, 'ko')), [visible]);
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
                {x.shared ? <Badge label="공용" tone="plain" /> : x.shareDepts?.length ? <Badge label={x.shareDepts.length === 1 ? x.shareDepts[0] : `${x.shareDepts.length}개 부서`} tone="plain" /> : null}
              </View>
              <Text numberOfLines={1} style={{ ...family.regular, fontSize: 12.5, color: c.sub, marginTop: 1 }}>{[x.company, primaryPhone(x), primaryEmail(x)].filter(Boolean).join(' · ')}</Text>
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
        {x.shared ? <Badge label="회사 공용" tone="plain" /> : x.shareDepts?.length ? <Badge label={`${x.shareDepts.join(', ')} 공유`} tone="plain" /> : <Badge label="내 연락처" tone="plain" />}
      </View>
      <View style={{ gap: 8, marginTop: space.md }}>
        {(x.phones?.length ? x.phones : x.phone ? [{ type: 'work' as PhoneKind, value: x.phone, primary: true }] : []).map((p, i) => <Row key={`p${i}`} icon="phone" text={p.value} hint={`${kindLabel(p.type)}${p.primary ? ' · 대표' : ''}`} onPress={() => call(p.value)} onLong={() => copy(p.value)} />)}
        {(x.emails?.length ? x.emails : x.email ? [{ value: x.email, primary: true }] : []).map((e, i) => <Row key={`e${i}`} icon="mail" text={e.value} hint={e.primary && (x.emails?.length ?? 0) > 1 ? '대표' : undefined} onPress={() => mail(e.value)} onLong={() => copy(e.value)} />)}
        {x.address ? <Row icon="map" text={x.address} onLong={() => copy(x.address!)} /> : null}
        {x.website ? <Row icon="link" text={x.website} onPress={() => void Linking.openURL(/^https?:/.test(x.website!) ? x.website! : `https://${x.website}`)} /> : null}
        {x.memo ? <Row icon="board" text={x.memo} /> : null}
      </View>
      {x.tags.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.md }}>{x.tags.map((t) => <Badge key={t} label={t} tone="plain" />)}</View> : null}
      <Text style={{ ...family.regular, fontSize: 12, color: c.faint, marginTop: space.md }}>{owner?.nickname ?? ''} 님이 등록</Text>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
        {x.ownerId === me.id ? <View style={{ flex: 1 }}><Button label="지우기" kind="plain" onPress={() => void work.deleteContact(x.id).then(onClose)} /></View> : null}
        {x.ownerId === me.id || ((x.shared || x.shareDepts?.length) && x.coEdit !== false) ? <View style={{ flex: 2 }}><Button label="고치기" onPress={() => onEdit(x)} /></View> : <View style={{ flex: 2 }}><Button label="닫기" kind="plain" onPress={onClose} /></View>}
      </View>
    </Sheet>
  );
}

function Row({ icon, text, hint, onPress, onLong }: { icon: 'phone' | 'mail' | 'board' | 'map' | 'link'; text: string; hint?: string; onPress?: () => void; onLong?: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} onLongPress={onLong} disabled={!onPress && !onLong} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, opacity: pressed ? 0.6 : 1 })}>
      <Icon name={icon} color={c.faint} size={16} />
      <Text selectable style={{ flex: 1, ...family.regular, fontSize: 15, color: onPress ? c.accent : c.text, lineHeight: 22 }}>{text}</Text>
      {hint ? <Text style={{ ...family.regular, fontSize: 12, color: c.faint }}>{hint}</Text> : null}
    </Pressable>
  );
}

function ContactEditor({ initial, onClose }: { initial?: Contact; onClose: () => void }) {
  const c = useColors();
  const s = useApp();
  const me = useMe();
  const [f, setF] = useState({ name: initial?.name ?? '', company: initial?.company ?? '', title: initial?.title ?? '', address: initial?.address ?? '', website: initial?.website ?? '', memo: initial?.memo ?? '', tags: initial?.tags.join(', ') ?? '' });
  const [phones, setPhones] = useState<{ type: PhoneKind; value: string; primary?: boolean }[]>(() => (initial?.phones?.length ? initial.phones : initial?.phone ? [{ type: 'work', value: initial.phone, primary: true }] : [{ type: 'cell', value: '', primary: true }]));
  const [emails, setEmails] = useState<{ value: string; primary?: boolean }[]>(() => (initial?.emails?.length ? initial.emails : initial?.email ? [{ value: initial.email, primary: true }] : [{ value: '', primary: true }]));
  const [share, setShare] = useState<'firm' | 'depts' | 'me'>(initial ? (initial.shared ? 'firm' : initial.shareDepts?.length ? 'depts' : 'me') : 'firm');
  const [depts, setDepts] = useState<string[]>(initial?.shareDepts ?? (me.dept ? [me.dept] : []));
  const [coEdit, setCoEdit] = useState(initial?.coEdit !== false);
  const [error, setError] = useState<string>();
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const allDepts = useMemo(() => orgGroups(s.users.filter((u) => u.role !== 'client')).map((g) => g.dept).filter((d) => d !== '소속 미지정'), [s.users]);
  const submit = async () => {
    const r = await work.saveContact({
      id: initial?.id, name: f.name, company: f.company.trim() || undefined, title: f.title.trim() || undefined, address: f.address.trim() || undefined, website: f.website.trim() || undefined,
      phones, emails, memo: f.memo.trim() || undefined, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
      shared: share === 'firm', shareDepts: share === 'depts' ? depts : [], coEdit,
    });
    if (!r.ok) return setError(r.reason);
    onClose();
  };
  const pill = (on: boolean, label: string, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: on ? c.text : c.surface }}>
      <Text style={{ ...family.semibold, fontSize: 12, color: on ? c.bg : c.sub }}>{label}</Text>
    </Pressable>
  );
  return (
    <Sheet open onClose={onClose}>
      <T size="h3" bold>{initial ? '연락처 고치기' : '고객·거래처 연락처'}</T>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexShrink: 1, marginTop: space.sm }}>
        <Input placeholder="이름" value={f.name} onChangeText={set('name')} autoFocus />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1.5 }}><Input placeholder="회사·기관" value={f.company} onChangeText={set('company')} /></View>
          <View style={{ flex: 1 }}><Input placeholder="직함" value={f.title} onChangeText={set('title')} /></View>
        </View>
        <Sub>전화</Sub>
        <View style={{ height: 6 }} />
        {phones.map((p, i) => (
          <View key={i} style={{ marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <View style={{ flex: 1 }}><Input placeholder="전화번호" value={p.value} onChangeText={(v) => setPhones((a) => a.map((x, j) => (j === i ? { ...x, value: v } : x)))} keyboardType="phone-pad" /></View>
              {phones.length > 1 ? <Pressable accessibilityLabel="전화 빼기" hitSlop={8} onPress={() => setPhones((a) => a.filter((_, j) => j !== i))}><Icon name="close" color={c.faint} size={18} /></Pressable> : null}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -6, marginBottom: 8 }}>
              {PHONE_KIND.map(([k, l]) => pill(p.type === k, l, () => setPhones((a) => a.map((x, j) => (j === i ? { ...x, type: k } : x)))))}
              {phones.length > 1 ? pill(!!p.primary, '대표', () => setPhones((a) => a.map((x, j) => ({ ...x, primary: j === i })))) : null}
            </View>
          </View>
        ))}
        <Pressable onPress={() => setPhones((a) => [...a, { type: 'work', value: '' }])} style={{ marginBottom: space.md }}><Text style={{ ...family.semibold, fontSize: 13, color: c.accent }}>+ 전화 더하기</Text></Pressable>
        <Sub>이메일</Sub>
        <View style={{ height: 6 }} />
        {emails.map((e, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={{ flex: 1 }}><Input placeholder="이메일" value={e.value} onChangeText={(v) => setEmails((a) => a.map((x, j) => (j === i ? { ...x, value: v } : x)))} keyboardType="email-address" autoCapitalize="none" /></View>
            {emails.length > 1 ? pill(!!e.primary, '대표', () => setEmails((a) => a.map((x, j) => ({ ...x, primary: j === i })))) : null}
            {emails.length > 1 ? <Pressable accessibilityLabel="이메일 빼기" hitSlop={8} onPress={() => setEmails((a) => a.filter((_, j) => j !== i))}><Icon name="close" color={c.faint} size={18} /></Pressable> : null}
          </View>
        ))}
        <Pressable onPress={() => setEmails((a) => [...a, { value: '' }])} style={{ marginBottom: space.md }}><Text style={{ ...family.semibold, fontSize: 13, color: c.accent }}>+ 이메일 더하기</Text></Pressable>
        <Input placeholder="주소 (선택)" value={f.address} onChangeText={set('address')} />
        <Input placeholder="웹사이트 (선택)" value={f.website} onChangeText={set('website')} autoCapitalize="none" />
        <Input placeholder="태그 (쉼표로 구분: 보험사, 교통사고)" value={f.tags} onChangeText={set('tags')} />
        <Input placeholder="메모" value={f.memo} onChangeText={set('memo')} multiline />
        <Sub>누가 보나</Sub>
        <View style={{ height: 6 }} />
        <Chips>
          <Chip label="회사 전체" active={share === 'firm'} onPress={() => setShare('firm')} />
          <Chip label="특정 부서" active={share === 'depts'} onPress={() => setShare('depts')} />
          <Chip label="나만" active={share === 'me'} onPress={() => setShare('me')} />
        </Chips>
        {share === 'depts' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space.md }}>
            {allDepts.map((d) => pill(depts.includes(d), d, () => setDepts((a) => (a.includes(d) ? a.filter((x) => x !== d) : [...a, d]))))}
          </View>
        ) : null}
        {share !== 'me' ? (
          <Chips>
            <Chip label="함께 고칠 수 있음" active={coEdit} onPress={() => setCoEdit(true)} />
            <Chip label="나만 고침" active={!coEdit} onPress={() => setCoEdit(false)} />
          </Chips>
        ) : null}
      </ScrollView>
      {error ? <Notice text={error} /> : null}
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
        <View style={{ flex: 1 }}><Button label="취소" kind="plain" onPress={onClose} /></View>
        <View style={{ flex: 2 }}><Button label={initial ? '저장' : '추가'} onPress={() => void submit()} /></View>
      </View>
    </Sheet>
  );
}
