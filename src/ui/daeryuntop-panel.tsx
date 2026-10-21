// 백오피스 '대륜탑 연동': 앱 사건에 대륜탑 사건번호 연결, 대륜탑 사건 목록 엑셀 올리기 (API가 생기기 전 임시).
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { readTableFile, rowsFromTable, summarize } from '@/core/daeryuntop';
import { canManageOpen } from '@/core/open-chat';
import { actions, deadlineCases } from '@/core/store';
import type { DeadlineCase } from '@/core/types';
import { Button, Card, Input, Notice, Sub, T } from '@/ui/kit';
import { space } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

/** 파일 고르기 (PC 웹) */
function pickFile(): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv,.html,.htm';
    input.onchange = () => resolve(input.files?.[0]);
    input.click();
  });
}

function CaseNoRow({ k, onDone }: { k: DeadlineCase; onDone: (r: { ok: boolean; reason?: string }, text: string) => void }) {
  const [no, setNo] = useState(k.caseNo ?? '');
  const changed = no.trim() !== (k.caseNo ?? '');
  return (
    <Card>
      <T bold>[{k.office}] {k.title}</T>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginTop: space.xs }}>
        <View style={{ flex: 1 }}>
          <Input placeholder="대륜탑 사건번호 (예: 2026가단1234)" value={no} onChangeText={setNo} accessibilityLabel={`${k.title} 대륜탑 사건번호`} />
        </View>
        <Button label="저장" small kind={changed ? 'primary' : 'soft'} disabled={!changed} onPress={() => onDone(actions.setCaseNo(k.roomId, no), no.trim() ? `${k.title}: 사건번호 ${no.trim()} 연결` : `${k.title}: 연결 해제`)} />
      </View>
    </Card>
  );
}

export function DaeryuntopSection({ report }: { report: (r: { ok: boolean; reason?: string }, okText: string) => void }) {
  const s = useApp();
  const user = useMe();
  const [busy, setBusy] = useState(false);
  const [unlinked, setUnlinked] = useState<string[]>([]);
  const cases = deadlineCases(s);

  const upload = async () => {
    const file = await pickFile();
    if (!file) return;
    setBusy(true);
    try {
      const { rows, error } = rowsFromTable(await readTableFile(await file.arrayBuffer()));
      if (error) return report({ ok: false, reason: error }, '');
      const r = await actions.importDaeryuntop(rows);
      if (!r.ok) return report(r, '');
      const sum = summarize(r.results);
      setUnlinked(sum.unlinked);
      report({ ok: true }, `대륜탑 기일 ${rows.length}줄: ${sum.text}${sum.unlinked.length ? ` · 연결 안 된 사건 ${sum.unlinked.length}` : ''}`);
    } catch (e) {
      report({ ok: false, reason: (e as Error).message || '파일을 읽지 못했습니다.' }, '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginTop: space.md }}>
      {Platform.OS === 'web' && canManageOpen(user) ? (
        <View style={{ marginBottom: space.md, gap: space.xs }}>
          <Button label={busy ? '올리는 중…' : '대륜탑 사건 목록 엑셀 올리기'} disabled={busy} onPress={() => void upload()} />
          {unlinked.length ? <Notice text={`앱 사건에 연결 안 된 사건번호: ${unlinked.join(', ')}`} /> : null}
        </View>
      ) : null}
      {cases.length ? cases.map((k) => <CaseNoRow key={`${k.roomId}:${k.caseNo ?? ''}`} k={k} onDone={report} />) : <Sub>사건이 없습니다.</Sub>}
    </View>
  );
}
