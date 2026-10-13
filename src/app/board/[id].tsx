import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { aliasIn, authorView, commentTree, timeAgo } from '@/core/board';
import { actions } from '@/core/store';
import { BoardAuthor, TextButton, VoteBar } from '@/ui/board';
import { Badge, Button, Empty, Input, Notice, Screen } from '@/ui/kit';
import { family, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<string>();
  const [error, setError] = useState<string>();
  const post = s.posts.find((p) => p.id === id);
  if (!post) return <Screen title="익명 게시판" back><Empty text="글을 찾을 수 없습니다." /></Screen>;

  const send = () => {
    const res = actions.commentPost(post.id, text, replyTo);
    if (!res.ok) return setError(res.reason);
    setText('');
    setReplyTo(undefined);
    setError(undefined);
  };
  const note = (to: string) => {
    const res = actions.openNote(post.id, to);
    if (!res.ok) return setError(res.reason);
    router.push({ pathname: '/board/note/[id]', params: { id: res.noteId! } });
  };
  const replyTarget = post.comments.find((x) => x.id === replyTo);

  return (
    <Screen title="익명 게시판" back>
      <BoardAuthor v={authorView(user, post, post.authorId, s.users)} time={timeAgo(post.at)} />
      <Text style={{ fontFamily: family.bold, fontSize: 20, lineHeight: 28, color: c.text, marginTop: space.xs }}>{post.title}</Text>
      <View style={{ flexDirection: 'row', marginVertical: space.sm }}>
        <Badge label={post.field} />
      </View>
      <Text style={{ fontFamily: family.regular, fontSize: 16, lineHeight: 24, color: c.text }}>{post.body}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: space.md, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: c.line }}>
        <VoteBar votes={post.votes} userId={user.id} onVote={(v) => actions.votePost(post.id, v)} />
        <Text style={{ fontFamily: family.semibold, fontSize: 13, color: c.sub }}>댓글 {post.comments.length}</Text>
        {post.authorId !== user.id ? <TextButton label="쪽지 보내기" onPress={() => note(post.authorId)} /> : null}
      </View>

      {commentTree(post).map(({ c: cm, depth }) => (
        <View key={cm.id} style={{ marginLeft: Math.min(depth, 4) * space.lg, paddingLeft: depth ? space.md : 0, borderLeftWidth: depth ? 2 : 0, borderLeftColor: c.line, paddingVertical: space.md }}>
          <BoardAuthor v={authorView(user, post, cm.authorId, s.users)} time={timeAgo(cm.at)} />
          <Text style={{ fontFamily: family.regular, fontSize: 15, lineHeight: 22, color: c.text, marginVertical: space.xs }}>{cm.text}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
            <VoteBar votes={cm.votes} userId={user.id} onVote={(v) => actions.voteComment(post.id, cm.id, v)} />
            <TextButton label="답글" onPress={() => setReplyTo(cm.id)} />
            {cm.authorId !== user.id ? <TextButton label="쪽지" onPress={() => note(cm.authorId)} /> : null}
          </View>
        </View>
      ))}

      <View style={{ marginTop: space.lg }}>
        {replyTarget ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
            <Text style={{ fontFamily: family.semibold, fontSize: 13, color: c.accent }}>{aliasIn(post, replyTarget.authorId)}에게 답글</Text>
            <TextButton label="취소" onPress={() => setReplyTo(undefined)} />
          </View>
        ) : null}
        <Input placeholder="익명으로 댓글 달기" value={text} onChangeText={setText} multiline />
        {error ? <Notice tone="warn" text={error} /> : null}
        <Button label="등록" onPress={send} />
      </View>
    </Screen>
  );
}
