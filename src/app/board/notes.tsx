import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { aliasIn, notesFor, otherIn, timeAgo, unreadIn } from '@/core/board';
import { Badge, Empty, Row, Screen } from '@/ui/kit';
import { family, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

// 익명 쪽지함
export default function NotesScreen() {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const notes = notesFor(user.id, s.notes).filter((n) => n.messages.length);
  return (
    <Screen title="쪽지함" back>
      {notes.length ? (
        notes.map((n) => {
          const post = s.posts.find((p) => p.id === n.postId);
          const other = otherIn(n, user.id);
          const last = n.messages.at(-1)!;
          const unread = unreadIn(n, user.id);
          const real = user.role === 'admin' ? s.users.find((u) => u.id === other)?.nickname : undefined;
          return (
            <Row
              key={n.id}
              title={`${post ? aliasIn(post, other) : '익명'}${real ? ` (${real})` : ''}`}
              sub={`${post?.title ?? ''} · ${last.text}`}
              right={
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={{ fontFamily: family.regular, fontSize: 12, color: c.faint }}>{timeAgo(last.at)}</Text>
                  {unread ? <Badge label={`${unread}`} /> : null}
                </View>
              }
              onPress={() => router.push({ pathname: '/board/note/[id]', params: { id: n.id } })}
            />
          );
        })
      ) : (
        <Empty text="받은 쪽지가 없습니다." />
      )}
    </Screen>
  );
}
