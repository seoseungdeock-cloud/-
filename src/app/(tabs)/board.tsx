import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { authorView, BOARD_SORT_LABEL, notesFor, sortPosts, timeAgo, unreadIn, type BoardSort } from '@/core/board';
import { actions } from '@/core/store';
import home from '@/data/home.json';
import { BoardAuthor, VoteBar } from '@/ui/board';
import { Icon } from '@/ui/icons';
import { Badge, Button, Empty, Screen } from '@/ui/kit';
import { family, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

// 익명 게시판 (레딧 r/legaladvice 구성 참고: 추천·비추천, 분야 태그, 정렬, 댓글 수)
export default function BoardScreen() {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const [sort, setSort] = useState<BoardSort>('hot');
  const [field, setField] = useState<string>();
  const unread = notesFor(user.id, s.notes).reduce((a, n) => a + unreadIn(n, user.id), 0);
  const posts = useMemo(() => sortPosts(s.posts.filter((p) => !field || p.field === field), sort), [s.posts, field, sort]);

  const right = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <Pressable accessibilityLabel="쪽지함" onPress={() => router.push('/board/notes')} hitSlop={10}>
        <Icon name="mail" color={c.text} size={26} />
        {unread ? (
          <View style={{ position: 'absolute', top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 10, fontFamily: family.bold }}>{unread}</Text>
          </View>
        ) : null}
      </Pressable>
      <Button small label="글쓰기" onPress={() => router.push('/board/new')} />
    </View>
  );

  return (
    <Screen title="익명 게시판" right={right}>
      <View style={{ flexDirection: 'row', gap: space.lg, marginBottom: space.sm }}>
        {(Object.keys(BOARD_SORT_LABEL) as BoardSort[]).map((k) => (
          <Pressable key={k} onPress={() => setSort(k)}>
            <Text style={{ fontFamily: sort === k ? family.bold : family.regular, fontSize: 15, color: sort === k ? c.accent : c.faint }}>{BOARD_SORT_LABEL[k]}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingBottom: space.md }}>
        {[undefined, ...home.fields].map((f) => (
          <Pressable key={f ?? 'all'} onPress={() => setField(f)} style={{ paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: field === f ? c.accent : c.line, backgroundColor: field === f ? c.accentSoft : c.bg }}>
            <Text style={{ fontFamily: family.semibold, fontSize: 13, color: field === f ? c.accent : c.sub }}>{f ?? '전체'}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {posts.length ? (
        posts.map((p) => (
          <View key={p.id} style={{ flexDirection: 'row', gap: space.md, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.line }}>
            <VoteBar vertical votes={p.votes} userId={user.id} onVote={(v) => actions.votePost(p.id, v)} />
            <Pressable style={{ flex: 1, gap: 4 }} onPress={() => router.push({ pathname: '/board/[id]', params: { id: p.id } })}>
              <BoardAuthor v={authorView(user, p, p.authorId, s.users)} time={timeAgo(p.at)} />
              <Text numberOfLines={2} style={{ fontFamily: family.bold, fontSize: 16, lineHeight: 22, color: c.text }}>{p.title}</Text>
              <View style={{ flexDirection: 'row' }}>
                <Badge label={p.field} />
              </View>
              <Text numberOfLines={2} style={{ fontFamily: family.regular, fontSize: 14, lineHeight: 20, color: c.sub }}>{p.body}</Text>
              <Text style={{ fontFamily: family.semibold, fontSize: 13, color: c.faint }}>댓글 {p.comments.length}</Text>
            </Pressable>
          </View>
        ))
      ) : (
        <Empty text="아직 글이 없습니다." />
      )}
    </Screen>
  );
}
