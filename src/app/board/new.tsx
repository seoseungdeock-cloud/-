import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { BOARD_LABEL, MAX_ATTACHMENTS } from '@/core/board';
import { actions } from '@/core/store';
import type { Attachment, BoardKind } from '@/core/types';
import home from '@/data/home.json';
import { Attachments } from '@/ui/board';
import { Button, Chip, Chips, Input, Notice, Screen, Section } from '@/ui/kit';
import { space } from '@/ui/theme';

let seq = 0;
const attId = () => `att_${Date.now().toString(36)}_${seq++}`;

// 사진·파일은 지금은 기기 안에만 있고, 서버가 붙으면 업로드합니다.
export default function NewPostScreen() {
  const params = useLocalSearchParams<{ board?: string }>();
  const board: BoardKind = params.board === 'lawyer' ? 'lawyer' : 'anon';
  const [field, setField] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [error, setError] = useState<string>();
  const room = MAX_ATTACHMENTS - files.length;
  const add = (more: Attachment[]) => {
    if (more.length > room) setError(`첨부는 ${MAX_ATTACHMENTS}개까지입니다.`);
    else setError(undefined);
    setFiles((cur) => [...cur, ...more].slice(0, MAX_ATTACHMENTS));
  };
  const pickImages = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: Math.max(room, 1), quality: 0.8 });
    if (res.canceled) return;
    add(res.assets.map((a) => ({ id: attId(), kind: 'image', name: a.fileName ?? '사진', uri: a.uri, size: a.fileSize })));
  };
  const pickFiles = async () => {
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return;
    add(res.assets.map((a) => ({ id: attId(), kind: a.mimeType?.startsWith('image/') ? 'image' : 'file', name: a.name, uri: a.uri, size: a.size })));
  };
  const submit = () => {
    const res = actions.createPost({ title, body, field, board, attachments: files });
    if (!res.ok) return setError(res.reason);
    router.replace({ pathname: '/board/[id]', params: { id: res.postId! } });
  };
  return (
    <Screen title={board === 'lawyer' ? `${BOARD_LABEL.lawyer} 글쓰기` : '익명 글쓰기'} back>
      <Section title="분야">
        <Chips>
          {home.fields.map((f) => <Chip key={f} label={f} active={field === f} onPress={() => setField(f)} />)}
        </Chips>
      </Section>
      <Input label="제목" value={title} onChangeText={setTitle} />
      <Input label="내용" value={body} onChangeText={setBody} multiline style={{ minHeight: 160, textAlignVertical: 'top' }} />
      <Attachments compact items={files} onRemove={(id) => setFiles((cur) => cur.filter((a) => a.id !== id))} />
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
        <Button small kind="soft" label={`사진 ${files.filter((a) => a.kind === 'image').length}`} disabled={!room} onPress={pickImages} />
        <Button small kind="soft" label={`파일 ${files.filter((a) => a.kind === 'file').length}`} disabled={!room} onPress={pickFiles} />
      </View>
      {error ? <Notice tone="warn" text={error} /> : null}
      <Button label={board === 'lawyer' ? '올리기' : '익명으로 올리기'} onPress={submit} />
    </Screen>
  );
}
