import { Text, View } from 'react-native';

import { SUGGESTION_STATUS } from '@/core/suggestions';
import type { Suggestion } from '@/core/types';
import { timeAgo } from '@/core/board';
import { Badge } from './kit';
import { family, radius, space, useColors } from './theme';

export function SuggestionCard({ s, author, children }: { s: Suggestion; author?: string; children?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: c.line, gap: space.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' }}>
        <Badge label={SUGGESTION_STATUS[s.status]} tone={s.status === 'done' ? 'secure' : s.status === 'hold' ? 'plain' : 'accent'} />
        {author ? <Text style={{ ...family.semibold, fontSize: 13, color: c.sub }}>{author}</Text> : null}
        <Text style={{ ...family.regular, fontSize: 12, color: c.faint }}>{timeAgo(s.at)}</Text>
      </View>
      <Text style={{ ...family.regular, fontSize: 15, lineHeight: 22, color: c.text }}>{s.body}</Text>
      {s.answer ? (
        <View style={{ backgroundColor: c.surface, borderRadius: radius.md, padding: space.md }}>
          <Text style={{ ...family.bold, fontSize: 13, color: c.accent, marginBottom: 2 }}>답변</Text>
          <Text style={{ ...family.regular, fontSize: 14, lineHeight: 20, color: c.text }}>{s.answer}</Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}
