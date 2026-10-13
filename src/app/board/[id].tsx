import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { authorView } from '@/core/board';
import { actions } from '@/core/store';
import { BoardAuthor } from '@/ui/board-author';
import { Button, Card, Empty, Input, Notice, Screen } from '@/ui/kit';
import { family, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const post = s.posts.find((p) => p.id === id);
  if (!post) return <Screen title="익명 게시판" back><Empty text="글을 찾을 수 없습니다." /></Screen>;

  const send = () => {
    const res = actions.commentPost(post.id, text);
    if (!res.ok) return setError(res.reason);
    setText('');
    setError(undefined);
  };

  return (
    <Screen title="익명 게시판" back>
      <Text style={{ fontFamily: family.bold, fontSize: 20, lineHeight: 28, color: c.text }}>{post.title}</Text>
      <View style={{ marginVertical: space.sm }}>
        <BoardAuthor v={authorView(user, post, post.authorId, s.users)} />
      </View>
      <Text style={{ fontFamily: family.regular, fontSize: 16, lineHeight: 24, color: c.text, marginBottom: space.xl }}>{post.body}</Text>
      <Text style={{ fontFamily: family.bold, fontSize: 15, color: c.text, marginBottom: space.sm }}>댓글 {post.comments.length}</Text>
      {post.comments.map((cm) => (
        <Card key={cm.id}>
          <BoardAuthor v={authorView(user, post, cm.authorId, s.users)} />
          <Text style={{ fontFamily: family.regular, fontSize: 15, lineHeight: 22, color: c.text, marginTop: space.xs }}>{cm.text}</Text>
        </Card>
      ))}
      <View style={{ marginTop: space.md }}>
        <Input placeholder="익명으로 댓글 달기" value={text} onChangeText={setText} multiline />
        {error ? <Notice tone="warn" text={error} /> : null}
        <Button label="등록" onPress={send} />
      </View>
    </Screen>
  );
}
