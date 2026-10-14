import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { authorView, BOARD_LABEL, boardOf, canSeeBoard, commentTree, isNoticePost, nameIn, RESTRICT_OPTIONS, timeAgo } from '@/core/board';
import { LAW_BOT } from '@/core/law-digest';
import { actions } from '@/core/store';
import type { RoomCheck } from '@/core/rooms';
import { Attachments, BoardAuthor, ReportPanel, TextButton, VoteBar } from '@/ui/board';
import { Badge, Button, Chip, Chips, Empty, Input, Notice, Screen } from '@/ui/kit';
import { family, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

type Target = { commentId?: string; authorId: string };

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<string>();
  const [reporting, setReporting] = useState<Target>();
  const [restricting, setRestricting] = useState<Target>();
  const [msg, setMsg] = useState<{ tone: 'warn' | 'accent'; text: string; bottom?: boolean }>();
  const post = s.posts.find((p) => p.id === id);
  const visible = !!post && canSeeBoard(user, boardOf(post));
  const isNotice = visible && isNoticePost(post!);
  // 공지를 열면 팝업에서도 확인한 것으로
  useEffect(() => {
    if (isNotice && id) actions.markNoticesSeen([id]);
  }, [isNotice, id]);
  // 변호사 게시판 글은 변호사 계정만 엽니다.
  if (!post || !visible) return <Screen title="게시판" back><Empty text="글을 찾을 수 없습니다." /></Screen>;
  const realName = boardOf(post) !== 'anon';
  const admin = user.role === 'admin';

  const run = (res: RoomCheck, done?: string, bottom?: boolean) => {
    setMsg(res.ok ? (done ? { tone: 'accent', text: done } : undefined) : { tone: 'warn', text: res.reason, bottom });
    return res.ok;
  };
  const send = () => {
    if (!run(actions.commentPost(post.id, text, replyTo), undefined, true)) return;
    setText('');
    setReplyTo(undefined);
  };
  const note = (to: string) => {
    const res = actions.openNote(post.id, to);
    if (run(res)) router.push({ pathname: '/board/note/[id]', params: { id: res.noteId! } });
  };
  const removePost = () => {
    if (run(actions.deletePost(post.id))) router.back();
  };
  const replyTarget = post.comments.find((x) => x.id === replyTo);

  // 신고 / 어드민 처리 패널: 대상 바로 아래에 펼칩니다.
  const panels = (t: Target) => (
    <>
      {reporting && reporting.commentId === t.commentId ? (
        <ReportPanel
          onCancel={() => setReporting(undefined)}
          onSubmit={(reason) => {
            if (run(actions.report(post.id, reason, t.commentId), '신고가 접수되었습니다.')) setReporting(undefined);
          }}
        />
      ) : null}
      {restricting && restricting.commentId === t.commentId ? (
        <View style={{ backgroundColor: c.surface, borderRadius: radius.md, padding: space.md, marginVertical: space.sm, gap: space.sm }}>
          <Text style={{ fontFamily: family.bold, fontSize: 14, color: c.text }}>{nameIn(post, t.authorId, s.users)} 이용 제한</Text>
          <Chips>
            {RESTRICT_OPTIONS.map((o) => (
              <Chip
                key={o.hours}
                label={o.label}
                onPress={() => {
                  if (run(actions.restrictUser(t.authorId, o.hours), `${o.label} 동안 게시판 이용을 제한했습니다.`)) setRestricting(undefined);
                }}
              />
            ))}
          </Chips>
          <TextButton label="취소" onPress={() => setRestricting(undefined)} />
        </View>
      ) : null}
    </>
  );

  const actionsFor = (t: Target) => (
    <>
      {t.authorId !== user.id && t.authorId !== LAW_BOT ? <TextButton icon="mail" label={t.commentId ? '쪽지' : '글쓴이에게 쪽지'} onPress={() => note(t.authorId)} /> : null}
      {t.authorId !== user.id && t.authorId !== LAW_BOT ? <TextButton icon="flag" label="신고" onPress={() => { setRestricting(undefined); setReporting(t); }} /> : null}
      {admin ? (
        <TextButton danger label="삭제" onPress={() => (t.commentId ? run(actions.deleteComment(post.id, t.commentId), '댓글을 삭제했습니다.') : removePost())} />
      ) : null}
      {admin && t.authorId !== user.id ? <TextButton danger label="이용 제한" onPress={() => { setReporting(undefined); setRestricting(t); }} /> : null}
    </>
  );

  return (
    <Screen title={BOARD_LABEL[boardOf(post)]} back>
      <BoardAuthor v={authorView(user, post, post.authorId, s.users)} time={timeAgo(post.at)} />
      <Text style={{ fontFamily: family.bold, fontSize: 20, lineHeight: 28, color: c.text, marginTop: space.xs }}>{post.title}</Text>
      <View style={{ flexDirection: 'row', gap: space.xs, marginVertical: space.sm }}>
        {isNotice ? <Badge label="공지" /> : null}
        {post.field ? <Badge label={post.field} tone="plain" /> : null}
      </View>
      <Text style={{ fontFamily: family.regular, fontSize: 16, lineHeight: 24, color: c.text }}>{post.body}</Text>
      <Attachments items={post.attachments ?? []} />
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.lg, marginTop: space.md }}>
        <VoteBar votes={post.votes} userId={user.id} onVote={(v) => run(actions.votePost(post.id, v))} />
        <Text style={{ fontFamily: family.semibold, fontSize: 13, color: c.sub }}>댓글 {post.comments.length}</Text>
        {actionsFor({ authorId: post.authorId })}
      </View>
      {panels({ authorId: post.authorId })}
      {msg && !msg.bottom ? <View style={{ marginTop: space.sm }}><Notice tone={msg.tone} text={msg.text} /></View> : null}
      <View style={{ height: 1, backgroundColor: c.line, marginTop: space.md }} />

      {commentTree(post).map(({ c: cm, depth }) => (
        <View key={cm.id} style={{ marginLeft: Math.min(depth, 4) * space.lg, paddingLeft: depth ? space.md : 0, borderLeftWidth: depth ? 2 : 0, borderLeftColor: c.line, paddingVertical: space.md }}>
          {cm.deleted ? (
            <Text style={{ fontFamily: family.regular, fontSize: 14, color: c.faint }}>삭제된 댓글입니다.</Text>
          ) : (
            <>
              <BoardAuthor v={authorView(user, post, cm.authorId, s.users)} time={timeAgo(cm.at)} />
              <Text style={{ fontFamily: family.regular, fontSize: 15, lineHeight: 22, color: c.text, marginVertical: space.xs }}>{cm.text}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.lg }}>
                <VoteBar votes={cm.votes} userId={user.id} onVote={(v) => run(actions.voteComment(post.id, cm.id, v))} />
                <TextButton label="답글" onPress={() => setReplyTo(cm.id)} />
                {actionsFor({ commentId: cm.id, authorId: cm.authorId })}
              </View>
              {panels({ commentId: cm.id, authorId: cm.authorId })}
            </>
          )}
        </View>
      ))}

      <View style={{ marginTop: space.lg }}>
        {replyTarget ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
            <Text style={{ fontFamily: family.semibold, fontSize: 13, color: c.accent }}>{nameIn(post, replyTarget.authorId, s.users)}에게 답글</Text>
            <TextButton label="취소" onPress={() => setReplyTo(undefined)} />
          </View>
        ) : null}
        <Input placeholder={realName ? '댓글 달기' : '익명으로 댓글 달기'} value={text} onChangeText={setText} multiline />
        {msg?.bottom ? <Notice tone={msg.tone} text={msg.text} /> : null}
        <Button label="등록" onPress={send} />
      </View>
    </Screen>
  );
}
