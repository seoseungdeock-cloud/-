import { Text, View } from 'react-native';

import type { AuthorView } from '@/core/board';
import { Badge } from '@/ui/kit';
import { family, space, useColors } from '@/ui/theme';

// 익명 이름 + 변호사 표시 + (어드민만) 실제 작성자
export function BoardAuthor({ v }: { v: AuthorView }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' }}>
      <Text style={{ fontFamily: family.semibold, fontSize: 13, color: c.sub }}>{v.alias}</Text>
      {v.lawyer ? <Badge label="변호사" /> : null}
      {v.real ? <Badge label={`작성자 ${v.real}`} tone="warn" /> : null}
    </View>
  );
}
