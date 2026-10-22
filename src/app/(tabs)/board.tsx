import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { authorView, BEST_MIN, BOARD_LABEL, BOARD_TAB, boardOf, boardsFor, canSeeBoard, canWriteBoard, needsField, pinNotices, unseenNotices, isBest as isBestPost, BOARD_SORT_LABEL, formatUntil, notesFor, restrictedUntil, score, searchPosts, sortPosts, timeAgo, unreadIn, type BoardSort } from '@/core/board';
import { actions } from '@/core/store';
import home from '@/data/home.json';
import type { BoardKind, BoardPost } from '@/core/types';
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
  const boards = boardsFor(user);
  // 공지 탭이 있는 계정은 공지 탭부터
  const [tab, setTab] = useState<BoardKind>(boards[0]);
  const board: BoardKind = canSeeBoard(user, tab) ? tab : 'anon';
  const notices = unseenNotices(user, s.posts, s.noticeSeen[user.id] ?? []);
  const dots = Object.fromEntries(notices.map((p) => [boardOf(p), true])) as Partial<Record<BoardKind, boolean>>;
  const unread = notesFor(user.id, s.notes).filter((n) => { const p = s.posts.find((x) => x.id === n.postId); return !p || canSeeBoard(user, boardOf(p)); }).reduce((a, n) => a + unreadIn(n, user.id), 0);
  const openReports = user.role === 'admin' ? s.reports.filter((r) => r.status === 'open').length : 0;
  const until = restrictedUntil(s.boardBans, user.id);
  const posts = useMemo(() => {
    const sorted = sortPosts(searchPosts(s.posts.filter((p) => boardOf(p) === board && (!needsField(board) || !field || p.field === field)), q), sort);
    return board === 'skyzai' ? pinNotices(sorted) : sorted;
  }, [s.posts, board, field, sort, q]);
  const dot = (n: number) =>
    n ? (
      <View style={{ position: 'absolute', top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 10, ...family.bold }}>{n}</Text>
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
      {canWriteBoard(user, board) ? <Button small label="글쓰기" onPress={() => router.push({ pathname: '/board/new', params: { board } })} /> : null}
    </View>
  );

  return (
    <Screen title={boards.length > 1 ? '게시판' : BOARD_LABEL.anon} right={right}>
      {notices.length ? <NoticePopup post={notices[0]} more={notices.length - 1} onOpen={(id) => { actions.markNoticesSeen([id]); router.push({ pathname: '/board/[id]', params: { id } }); }} onClose={() => actions.markNoticesSeen(notices.map((p) => p.id))} /> : null}
      {boards.length > 1 ? (
        <View style={{ marginBottom: space.md }}>
          <UnderlineTabs tabs={boards.map((b) => [b, BOARD_TAB[b]] as [BoardKind, string])} value={board} onChange={setTab} dots={dots} scroll={boards.length > 5} />
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
          style={{ flex: 1, paddingVertical: space.sm + 2, fontSize: 15, ...family.regular, color: c.text }}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: space.lg, marginBottom: space.sm }}>
        {(Object.keys(BOARD_SORT_LABEL) as BoardSort[]).map((k) => (
          <Pressable key={k} onPress={() => setSort(k)}>
            <Text style={{ ...(sort === k ? family.bold : family.regular), fontSize: 15, color: sort === k ? c.accent : c.faint }}>{BOARD_SORT_LABEL[k]}</Text>
          </Pressable>
        ))}
      </View>
      {needsField(board) ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingBottom: space.md }}>
        {[undefined, ...home.fields].map((f) => (
          <Pressable key={f ?? 'all'} onPress={() => setField(f)} style={{ paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: field === f ? c.accent : c.line, backgroundColor: field === f ? c.accentSoft : c.bg }}>
            <Text style={{ ...family.semibold, fontSize: 13, color: field === f ? c.accent : c.sub }}>{f ?? '전체'}</Text>
          </Pressable>
        ))}
      </ScrollView>
      ) : null}
      {posts.length ? (
        posts.map((p) => {
          const votes = score(p.votes);
          const who = authorView(user, p, p.authorId, s.users);
          return (
            // DC인사이드 목록처럼: 제목만, 댓글 수는 색을 달리, 추천 10개 이상은 빨간 테두리 별, 20개 이상은 꽉 찬 별. 추천은 글 안에서만.
            <Pressable key={p.id} onPress={() => router.push({ pathname: '/board/[id]', params: { id: p.id } })} style={({ pressed }) => ({ paddingVertical: space.sm + 2, borderBottomWidth: 1, borderBottomColor: c.line, gap: 3, opacity: pressed ? 0.6 : 1 })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {p.notice ? <Badge label="공지" /> : <Icon name={votes >= 20 ? 'starFill' : votes >= 10 ? 'star' : 'board'} color={votes >= 10 ? c.accent : c.faint} size={16} />}
                <Text numberOfLines={1} style={{ flexShrink: 1, ...family.semibold, fontSize: 15, color: c.text }}>{p.title}</Text>
                {p.comments.length ? <Text style={{ ...family.bold, fontSize: 13, color: c.accent }}>[{p.comments.length}]</Text> : null}
              </View>
              <Text numberOfLines={1} style={{ ...family.regular, fontSize: 12, color: c.faint, paddingLeft: 22 }}>
                {[who.real ? `${who.alias} (${who.real})` : who.alias, timeAgo(p.at), p.field, `추천 ${votes}`, sort !== 'best' && isBestPost(p) ? '베스트' : ''].filter(Boolean).join(' · ')}
              </Text>
            </Pressable>
          );
        })
      ) : (
        <Empty text={q ? '검색 결과가 없습니다.' : sort === 'best' ? `추천 ${BEST_MIN}개 이상인 글이 아직 없습니다.` : '아직 글이 없습니다.'} />
      )}
    </Screen>
  );
}

// 새 공지 팝업: 게시판 맨 위. 보기는 그 공지만, 닫기는 지금 뜬 공지 전부를 확인 처리합니다.
function NoticePopup({ post, more, onOpen, onClose }: { post: BoardPost; more: number; onOpen: (id: string) => void; onClose: () => void }) {
  const c = useColors();
  return (
    <View style={{ borderRadius: radius.lg, borderWidth: 1.5, borderColor: c.accent, backgroundColor: c.bg, padding: space.md, marginBottom: space.md, gap: space.xs, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        <Icon name="notice" color={c.accent} size={18} />
        <Text style={{ ...family.bold, fontSize: 13, color: c.accent }}>{boardOf(post) === 'notice' ? '새 공지' : `${BOARD_LABEL[boardOf(post)]} 새 공지`}</Text>
        {more > 0 ? <Text style={{ ...family.regular, fontSize: 12, color: c.faint }}>외 {more}건</Text> : null}
        <Pressable accessibilityLabel="공지 닫기" hitSlop={8} onPress={onClose} style={{ marginLeft: 'auto' }}>
          <Icon name="close" color={c.sub} size={18} />
        </Pressable>
      </View>
      <Pressable onPress={() => onOpen(post.id)}>
        <Text numberOfLines={1} style={{ ...family.bold, fontSize: 16, color: c.text }}>{post.title}</Text>
        <Text numberOfLines={2} style={{ ...family.regular, fontSize: 14, lineHeight: 20, color: c.sub, marginTop: 2 }}>{post.body}</Text>
        <Text style={{ ...family.semibold, fontSize: 13, color: c.accent, marginTop: space.xs }}>공지 보기</Text>
      </Pressable>
    </View>
  );
}
