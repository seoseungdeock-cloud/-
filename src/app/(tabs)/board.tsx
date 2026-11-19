import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { isUnreadMustRead, pendingMustReads, authorView, BEST_MIN, BOARD_LABEL, BOARD_TAB, boardOf, boardsFor, canSeeBoard, canWriteBoard, needsField, pinNotices, unseenNotices, isBest as isBestPost, BOARD_SORT_LABEL, formatUntil, notesFor, restrictedUntil, score, searchPosts, sortPosts, timeAgo, unreadIn, type BoardSort } from '@/core/board';
import { actions } from '@/core/store';
import { BOARD_FIELDS } from '@/core/board-fields';
import type { BoardKind, BoardPost } from '@/core/types';
import { todayKst } from '@/core/calendar';
import { UnderlineTabs } from '@/ui/contacts';
import { Icon } from '@/ui/icons';
import { Badge, Button, Empty, Notice, Screen } from '@/ui/kit';
import { Appear, Fade, Press } from '@/ui/motion';
import { ChipBar, SegmentBar } from '@/ui/segments';
import { family, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

// 게시판: 익명 게시판 + (변호사 계정만) 변호사 게시판. 레딧 r/legaladvice 구성 참고: 추천·비추천, 분야 태그, 정렬, 댓글 수, 검색)
export default function BoardScreen() {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const [sort, setSort] = useState<BoardSort>('hot');
  const today = todayKst();
  const mustReads = pendingMustReads(s.posts.filter((p) => canSeeBoard(user, boardOf(p))), today);
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.surface, borderRadius: radius.md + 2, paddingHorizontal: space.md + 2, height: 44 }}>
          <Icon name="search" color={c.mute} size={18} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="게시판 검색"
            placeholderTextColor={c.mute}
            style={{ flex: 1, height: '100%', fontSize: 15, ...family.regular, color: c.text, ...({ outlineStyle: 'none' } as object) }}
          />
        </View>
        <SegmentBar items={(Object.keys(BOARD_SORT_LABEL) as BoardSort[]).map((k) => [k, BOARD_SORT_LABEL[k]] as [BoardSort, string])} value={sort} onChange={setSort} />
      </View>
      {mustReads.length ? (
        <Press onPress={() => router.push({ pathname: '/board/[id]', params: { id: mustReads[0].id } })} scale={0.99} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.warnSoft, borderRadius: radius.md, paddingVertical: space.sm + 2, paddingHorizontal: space.md, marginBottom: space.md }}>
          <Icon name="notice" color={c.warn} size={18} />
          <Text style={{ flex: 1, ...family.semibold, fontSize: 14, color: c.warn }} numberOfLines={1}>아직 읽지 않은 필독 {mustReads.length}건 — {mustReads[0].title}{mustReads[0].mustReadUntil ? ` (~${mustReads[0].mustReadUntil.slice(5).replace('-', '/')})` : ''}</Text>
          <Icon name="chevron" color={c.warn} size={16} />
        </Press>
      ) : null}
      {needsField(board) ? (
        <View style={{ marginHorizontal: -space.lg, marginBottom: space.md }}>
          <ChipBar items={[['', '전체'], ...BOARD_FIELDS.map((f) => [f, f] as [string, string])]} value={field ?? ''} onChange={(f) => setField(f || undefined)} size="sm" />
        </View>
      ) : null}
      <Fade key={`${board}-${sort}-${field ?? ''}-${q}`}>
        {posts.length ? (
          posts.map((p, i) => {
            const votes = score(p.votes);
            const who = authorView(user, p, p.authorId, s.users);
            const hot = votes >= 10;
            return (
              // 카드 한 장 = 글 하나. 제목, 작성자·시각·분야, 댓글 수 배지. 추천 10개 이상은 별(20개 이상은 꽉 찬 별)
              <Appear key={p.id} index={i}>
                <Press
                  onPress={() => router.push({ pathname: '/board/[id]', params: { id: p.id } })}
                  scale={0.985}
                  style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, marginBottom: space.sm, borderRadius: radius.lg, backgroundColor: hovered ? c.lineStrong : c.surface })}>
                  <View style={{ width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: p.notice ? c.navBg : hot ? c.accentSoft : c.bg }}>
                    <Icon name={p.notice ? 'notice' : votes >= 20 ? 'starFill' : hot ? 'star' : 'board'} color={p.notice ? c.navText : hot ? c.accent : c.faint} size={18} />
                  </View>
                  <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {p.notice ? <Badge label="공지" /> : null}
                      {p.mustReadUntil ? <Badge label={isUnreadMustRead(p, today) ? '필독' : '필독 ✓'} tone={isUnreadMustRead(p, today) ? 'warn' : 'plain'} /> : null}
                      <Text numberOfLines={1} style={{ flexShrink: 1, ...family.semibold, fontSize: 15, color: c.text, letterSpacing: -0.2 }}>{p.title}</Text>
                    </View>
                    <Text numberOfLines={1} style={{ ...family.regular, fontSize: 12.5, color: c.faint }}>
                      {[who.real ? `${who.alias} (${who.real})` : who.alias, timeAgo(p.at), p.field, `추천 ${votes}`, sort !== 'best' && isBestPost(p) ? '베스트' : ''].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  {p.comments.length ? (
                    <View style={{ minWidth: 30, height: 30, borderRadius: 15, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
                      <Text style={{ ...family.bold, fontSize: 12.5, color: c.accent }}>{p.comments.length}</Text>
                    </View>
                  ) : null}
                </Press>
              </Appear>
            );
          })
        ) : (
          <Empty text={q ? '검색 결과가 없습니다.' : sort === 'best' ? `추천 ${BEST_MIN}개 이상인 글이 아직 없습니다.` : '아직 글이 없습니다.'} />
        )}
      </Fade>
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
