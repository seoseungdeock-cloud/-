import { useState } from 'react';
import { View } from 'react-native';

import { canSeeSuggestions } from '@/core/rooms';
import { actions } from '@/core/store';
import { inbox, SUGGESTION_STATUS } from '@/core/suggestions';
import type { SuggestionStatus } from '@/core/types';
import { TextButton } from '@/ui/board';
import { Button, Chip, Chips, Empty, Input, Notice, Screen } from '@/ui/kit';
import { SuggestionCard } from '@/ui/suggestion';
import { space } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

const ROLE_LABEL = { client: '의뢰인', lawyer: '변호사', staff: '직원', admin: '어드민' } as const;
const STATUSES = Object.keys(SUGGESTION_STATUS) as SuggestionStatus[];

// 건의사항함: 개발자어드민만. 처리 상태를 바꾸고 답변을 남깁니다.
export default function SuggestionInboxScreen() {
  const s = useApp();
  const user = useMe();
  const [filter, setFilter] = useState<SuggestionStatus>();
  const [editing, setEditing] = useState<string>();
  const [status, setStatus] = useState<SuggestionStatus>('review');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  if (!canSeeSuggestions(user)) return <Screen title="건의사항함" back><Empty text="개발자어드민만 볼 수 있습니다." /></Screen>;
  const list = inbox(s.suggestions, filter);
  const author = (id: string) => {
    const u = s.users.find((x) => x.id === id);
    return u ? `${u.nickname} · ${ROLE_LABEL[u.role]}` : '알 수 없음';
  };
  return (
    <Screen title="건의사항함" back>
      <Chips>
        <Chip label={`전체 ${s.suggestions.length}`} active={!filter} onPress={() => setFilter(undefined)} />
        {STATUSES.map((k) => (
          <Chip key={k} label={`${SUGGESTION_STATUS[k]} ${s.suggestions.filter((x) => x.status === k).length}`} active={filter === k} onPress={() => setFilter(k)} />
        ))}
      </Chips>
      {list.length ? (
        list.map((x) => (
          <SuggestionCard key={x.id} s={x} author={author(x.authorId)}>
            {editing === x.id ? (
              <View style={{ gap: space.sm, marginTop: space.sm }}>
                <Chips>
                  {STATUSES.map((k) => <Chip key={k} label={SUGGESTION_STATUS[k]} active={status === k} onPress={() => setStatus(k)} />)}
                </Chips>
                <Input placeholder="답변" value={answer} onChangeText={setAnswer} multiline />
                {error ? <Notice text={error} /> : null}
                <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}>
                  <Button
                    small
                    label="저장"
                    onPress={() => {
                      const r = actions.answerSuggestion(x.id, status, answer);
                      if (!r.ok) return setError(r.reason);
                      setError('');
                      setEditing(undefined);
                    }}
                  />
                  <TextButton label="취소" onPress={() => setEditing(undefined)} />
                </View>
              </View>
            ) : (
              <TextButton
                label="처리하기"
                onPress={() => {
                  setEditing(x.id);
                  setStatus(x.status === 'open' ? 'review' : x.status);
                  setAnswer(x.answer ?? '');
                }}
              />
            )}
          </SuggestionCard>
        ))
      ) : (
        <Empty text="건의사항이 없습니다." />
      )}
    </Screen>
  );
}
