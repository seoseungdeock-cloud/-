import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { formatUntil, reportTarget, RESTRICT_OPTIONS, restrictedUntil, timeAgo } from '@/core/board';
import { actions } from '@/core/store';
import type { BoardReport } from '@/core/types';
import { TextButton } from '@/ui/board';
import { Badge, Card, Chip, Chips, Empty, Row, Screen, Section } from '@/ui/kit';
import { family, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

// 어드민 신고함: 신고 확인, 글·댓글 삭제, 이용 제한, 기각
export default function ReportsScreen() {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  if (user.role !== 'admin') return <Screen title="신고함" back><Empty text="어드민만 볼 수 있습니다." /></Screen>;

  const name = (id: string) => s.users.find((u) => u.id === id)?.nickname ?? '알 수 없음';
  const open = s.reports.filter((r) => r.status === 'open');
  const done = s.reports.filter((r) => r.status !== 'open').slice(0, 20);
  const banned = Object.keys(s.boardBans).filter((id) => restrictedUntil(s.boardBans, id));

  // 변호사 게시판 글은 어드민도 열람하지 않고, 신고된 부분만 신고함에서 처리합니다.
  const lawyerPost = (postId: string) => s.posts.find((p) => p.id === postId)?.board === 'lawyer';
  const item = (r: BoardReport) => {
    const t = reportTarget(r, s.posts);
    return (
      <Card key={r.id}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.xs, flexWrap: 'wrap' }}>
          <Badge label={t?.kind ?? '삭제됨'} tone="plain" />
          {lawyerPost(r.postId) ? <Badge label="변호사 게시판" tone="plain" /> : null}
          <Badge label={r.reason} tone="warn" />
          <Text style={{ fontFamily: family.regular, fontSize: 12, color: c.faint }}>{timeAgo(r.at)} · 신고자 {name(r.reporterId)}</Text>
        </View>
        {t ? (
          <>
            <Text numberOfLines={3} style={{ fontFamily: family.regular, fontSize: 15, lineHeight: 22, color: c.text }}>{t.text}</Text>
            <Text style={{ fontFamily: family.semibold, fontSize: 13, color: c.sub, marginTop: space.xs }}>작성자 {name(t.authorId)}</Text>
          </>
        ) : (
          <Text style={{ fontFamily: family.regular, fontSize: 14, color: c.faint }}>대상이 이미 삭제되었습니다.</Text>
        )}
        {r.status === 'open' && t ? (
          <View style={{ marginTop: space.sm, gap: space.sm }}>
            <View style={{ flexDirection: 'row', gap: space.lg, flexWrap: 'wrap' }}>
              {lawyerPost(r.postId) ? null : <TextButton label="원문 보기" onPress={() => router.push({ pathname: '/board/[id]', params: { id: r.postId } })} />}
              <TextButton danger label={`${t.kind} 삭제`} onPress={() => (r.commentId ? actions.deleteComment(r.postId, r.commentId) : actions.deletePost(r.postId))} />
              <TextButton label="문제없음" onPress={() => actions.closeReport(r.id, 'dismissed', '기각')} />
            </View>
            <Chips>
              {RESTRICT_OPTIONS.map((o) => (
                <Chip
                  key={o.hours}
                  label={`작성자 ${o.label} 제한`}
                  onPress={() => {
                    if (actions.restrictUser(t.authorId, o.hours).ok) actions.closeReport(r.id, 'resolved', `작성자 ${o.label} 이용 제한`);
                  }}
                />
              ))}
            </Chips>
          </View>
        ) : r.resolution ? (
          <Text style={{ fontFamily: family.semibold, fontSize: 13, color: c.accent, marginTop: space.xs }}>처리: {r.resolution}</Text>
        ) : null}
      </Card>
    );
  };

  return (
    <Screen title="신고함" back>
      <Section title={`접수된 신고 ${open.length}`}>{open.length ? open.map(item) : <Empty text="처리할 신고가 없습니다." />}</Section>
      <Section title="이용 제한 중">
        {banned.length ? (
          banned.map((id) => (
            <Row key={id} title={name(id)} sub={`${formatUntil(s.boardBans[id])}까지`} right={<TextButton label="해제" onPress={() => actions.liftRestriction(id)} />} />
          ))
        ) : (
          <Empty text="제한된 이용자가 없습니다." />
        )}
      </Section>
      {done.length ? <Section title="처리한 신고">{done.map(item)}</Section> : null}
    </Screen>
  );
}
