// 백오피스 → 의뢰인 전화번호: '이름 번호'를 붙여 넣으면 같은 이름의 의뢰인 계정에 휴대전화를 넣습니다.
// 앱에서 '전화 올 때 의뢰인 이름'을 켠 변호사·직원 폰에 이 번호가 '의뢰인 이름 · 사건'으로 들어갑니다.
import { useState } from 'react';
import { View } from 'react-native';

import { parsePhoneList } from '@/core/caller-names';
import { actions } from '@/core/store';
import { Button, Input, Sub } from '@/ui/kit';
import { space } from '@/ui/theme';

const LABEL = { ok: '넣음', none: '이 이름의 의뢰인 계정 없음', many: '같은 이름이 여럿', bad: '번호 형식 아님' } as const;

export function ClientPhonesSection({ report }: { report: (r: { ok: boolean; reason?: string }, okText: string) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const parsed = parsePhoneList(text);
  const send = async () => {
    setBusy(true);
    try {
      const r = await actions.setClientPhones(parsed.items);
      const ok = r.filter((x) => x.result === 'ok').length;
      setLines([...r.filter((x) => x.result !== 'ok').map((x) => `${x.name}: ${LABEL[x.result]}`), ...parsed.bad.map((b) => `${b}: ${LABEL.bad}`)]);
      report({ ok: true }, `의뢰인 ${ok}명의 번호를 넣었습니다.`);
      if (ok) setText('');
    } catch (e) {
      report({ ok: false, reason: (e as Error).message || '넣지 못했습니다.' }, '');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ marginTop: space.md, gap: space.sm }}>
      <Input label="한 줄에 한 명: 이름 010-1234-5678" value={text} onChangeText={setText} multiline placeholder={'홍길동 010-1234-5678\n김영희 010-9876-5432'} />
      <Sub>{`읽은 줄 ${parsed.items.length}${parsed.bad.length ? ` · 형식이 다른 줄 ${parsed.bad.length}` : ''}`}</Sub>
      <Button label={busy ? '넣는 중…' : `${parsed.items.length}명 번호 넣기`} disabled={busy || !parsed.items.length} onPress={() => void send()} />
      {lines.map((l) => <Sub key={l}>{l}</Sub>)}
    </View>
  );
}
