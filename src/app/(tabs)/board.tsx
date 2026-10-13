import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { authorView, BEST_MIN, BOARD_LABEL, boardOf, canSeeBoard, isBest as isBestPost, BOARD_SORT_LABEL, formatUntil, notesFor, restrictedUntil, searchPosts, sortPosts, timeAgo, unreadIn, type BoardSort } from '@/core/board';
import { actions } from '@/core/store';
import home from '@/data/home.json';
import { BoardAuthor, VoteBar } from '@/ui/board';
import type { BoardKind } from '@/core/types';
import { UnderlineTabs } from '@/ui/contacts';
import { Icon } from '@/ui/icons';
import { Badge, Button, Empty, Notice, Screen } from '@/ui/kit';
import { family, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

// 게시판: 익명 게시판 + (변호사 계정만) 변호사 게시판. 레딧 r/legaladvice 구성 참고: 추천·비추천, 분야 태그, 정렬, 댓글 수, 검색)
export default function BoardScreen() {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const [sort, setSort] = useState<BoardSort>('hot');
  const [field, setField] = useState<string>();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<BoardKind>('anon');
  const board: BoardKind = canSeeBoard(user, tab) ? tab : 'anon';
  const lawyer = canSeeBoard(user, 'lawyer');
  const unread = notesFor(user.id, s.notes).filter((n) => { const p = s.posts.find((x) => x.id === n.postId); return !p || canSeeBoard(user, boardOf(p)); }).reduce((a, n) => a + unreadIn(n, user.id), 0);
  const openReports = user.role === 'admin' ? s.reports.filter((r) => r.status === 'open').length : 0;
  const until = restrictedUntil(s.boardBans, user.id);
  const posts = useMemo(() => sortPosts(searchPosts(s.posts.filter((p) => boardOf(p) === board && (!field || p.field === field)), q), sort), [s.posts, board, field, sort, q]);
  const dot = (n: number) =>
    n ? (
      <View style={{ position: 'absolute', top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 10, fontFamily: family.bold }}>{n}</Text>
      </View>
    ) : null;

  const right = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      {user.role === 'admin' ? (
        <Pressable accessibilityLabel="신고함" onPress={() => router.push('/board/reports')} hitSlop={10}>
          <Icon name="flag" color={c.text} size={24} />
          {dot(openReports)}
        </Pressable>
      ) : null}
      <Pressable accessibilityLabel="쪽지함" onPress={() => router.push('/board/notes')} hitSlop={10}>
        <Icon name="mail" color={c.text} size={26} />
        {dot(unread)}
      </Pressable>
      <Button small label="글쓰기" onPress={() => router.push({ pathname: '/board/new', params: { board } })} />
    </View>
  );

  return (
    <Screen title={lawyer ? '게시판' : BOARD_LABEL.anon} right={right}>
      {lawyer ? (
        <View style={{ marginBottom: space.md }}>
          <UnderlineTabs tabs={[['anon', BOARD_LABEL.anon], ['lawyer', BOARD_LABEL.lawyer]]} value={board} onChange={setTab} />
        </View>
      ) : null}
      {until ? <Notice tone="warn" text={`게시판 이용이 제한되었습니다. (${formatUntil(until)}까지)`} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.surface, borderRadius: radius.pill, paddingHorizontal: space.md, marginBottom: space.md }}>
        <Icon name="search" color={c.faint} size={18} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="게시판 검색"
          placeholderTextColor={c.faint}
          style={{ flex: 1, paddingVertical: space.sm + 2, fontSize: 15, fontFamily: family.regular, color: c.text }}
        />
      </View>
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
            <VoteBar vertical votes={p.votes} userId={user.id} onVote={(v) => { actions.votePost(p.id, v); }} />
            <Pressable style={{ flex: 1, gap: 4 }} onPress={() => router.push({ pathname: '/board/[id]', params: { id: p.id } })}>
              <BoardAuthor v={authorView(user, p, p.authorId, s.users)} time={timeAgo(p.at)} />
              <Text numberOfLines={2} style={{ fontFamily: family.bold, fontSize: 16, lineHeight: 22, color: c.text }}>{p.title}</Text>
              <View style={{ flexDirection: 'row', gap: space.xs }}>
                {sort !== 'best' && isBestPost(p) ? <Badge label="베스트" tone="warn" /> : null}
                <Badge label={p.field} />
              </View>
              <Text numberOfLines={2} style={{ fontFamily: family.regular, fontSize: 14, lineHeight: 20, color: c.sub }}>{p.body}</Text>
              <Text style={{ fontFamily: family.semibold, fontSize: 13, color: c.faint }}>댓글 {p.comments.length}</Text>
            </Pressable>
          </View>
        ))
      ) : (
        <Empty text={q ? '검색 결과가 없습니다.' : sort === 'best' ? `추천 ${BEST_MIN}개 이상인 글이 아직 없습니다.` : '아직 글이 없습니다.'} />
      )}
    </Screen>
  );
}
