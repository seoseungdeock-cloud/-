import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { authorView } from '@/core/board';
import { BoardAuthor } from '@/ui/board-author';
import { Button, Card, Empty, Screen } from '@/ui/kit';
import { family, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

export default function BoardScreen() {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  return (
    <Screen title="익명 게시판" back right={<Button small label="글쓰기" onPress={() => router.push('/board/new')} />}>
      {s.posts.length ? (
        s.posts.map((p) => (
          <Card key={p.id} onPress={() => router.push({ pathname: '/board/[id]', params: { id: p.id } })}>
            <Text numberOfLines={1} style={{ fontFamily: family.bold, fontSize: 16, color: c.text }}>{p.title}</Text>
            <Text numberOfLines={2} style={{ fontFamily: family.regular, fontSize: 14, lineHeight: 20, color: c.sub, marginVertical: space.xs }}>{p.body}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <BoardAuthor v={{ ...authorView(user, p, p.authorId, s.users), alias: '익명' }} />
              <Text style={{ fontFamily: family.regular, fontSize: 13, color: c.faint }}>댓글 {p.comments.length}</Text>
            </View>
          </Card>
        ))
      ) : (
        <Empty text="아직 글이 없습니다." />
      )}
    </Screen>
  );
}
