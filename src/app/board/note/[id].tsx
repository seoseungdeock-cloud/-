import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { boardOf, canSeeBoard, nameIn, otherIn, timeAgo } from '@/core/board';
import { actions } from '@/core/store';
import { Button, Empty, Input, Notice, Screen } from '@/ui/kit';
import { family, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

// 익명 쪽지 대화. 서로 그 글의 '익명 N'으로만 보입니다 (어드민은 실제 이름도 봄).
export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const note = s.notes.find((n) => n.id === id);
  const lastAt = note?.messages.at(-1)?.at;
  useEffect(() => {
    if (id) actions.readNote(id);
  }, [id, lastAt]);
  const notePost = note ? s.posts.find((p) => p.id === note.postId) : undefined;
  if (!note || (notePost && !canSeeBoard(user, boardOf(notePost)))) return <Screen title="쪽지" back><Empty text="쪽지를 찾을 수 없습니다." /></Screen>;

  const post = s.posts.find((p) => p.id === note.postId);
  const other = otherIn(note, user.id);
  const real = user.role === 'admin' && post && boardOf(post) === 'anon' ? s.users.find((u) => u.id === other)?.nickname : undefined;
  const send = () => {
    const res = actions.sendNote(note.id, text);
    if (!res.ok) return setError(res.reason);
    setText('');
    setError(undefined);
  };

  return (
    <Screen title={`${nameIn(post, other, s.users)}${real ? ` (${real})` : ''}`} back>
      {post ? <Text numberOfLines={1} style={{ fontFamily: family.regular, fontSize: 13, color: c.faint, marginBottom: space.md }}>{post.title}</Text> : null}
      {note.messages.map((m) => {
        const mine = m.senderId === user.id;
        return (
          <View key={m.id} style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: space.sm }}>
            <View style={{ maxWidth: '80%', backgroundColor: mine ? c.bubbleMine : c.bubbleOther, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm }}>
              <Text style={{ fontFamily: family.regular, fontSize: 15, lineHeight: 22, color: mine ? c.bubbleMineText : c.text }}>{m.text}</Text>
            </View>
            <Text style={{ fontFamily: family.regular, fontSize: 11, color: c.faint, marginTop: 2 }}>{timeAgo(m.at)}</Text>
          </View>
        );
      })}
      <View style={{ marginTop: space.md }}>
        <Input placeholder={post && boardOf(post) === 'lawyer' ? '쪽지 쓰기' : '익명으로 쪽지 쓰기'} value={text} onChangeText={setText} multiline />
        {error ? <Notice tone="warn" text={error} /> : null}
        <Button label="보내기" onPress={send} />
      </View>
    </Screen>
  );
}
