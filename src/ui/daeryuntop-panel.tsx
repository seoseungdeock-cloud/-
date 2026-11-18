// 백오피스 '대륜탑 연동': 구성원 명단 동기화(대륜탑은 읽기만), 앱 사건에 대륜탑 사건번호 연결, 대륜탑 사건 목록 엑셀 올리기 (API가 생기기 전 임시).
import { useEffect, useState } from 'react';
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

/** 구성원 명단 동기화 카드 — 대륜탑 admin_user 를 읽어 계정을 만들고 이름·직위·부서·지점을 맞춥니다. */
function MembersSyncCard({ report }: { report: (r: { ok: boolean; reason?: string }, okText: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ syncedAt?: string; active: number; inactive: number } | null>(null);
  const load = () => void actions.daeryuntopSyncStatus().then(setStatus);
  useEffect(load, []);
  const run = async () => {
    setBusy(true);
    const r = await actions.syncDaeryuntopMembers();
    setBusy(false);
    report(r, r.ok ? `명단 동기화 완료 — ${r.summary}` : '');
    load();
  };
  const when = status?.syncedAt ? new Date(status.syncedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
  return (
    <Card>
      <T bold>구성원 명단</T>
      <Sub>대륜탑 재직 명단을 읽어 계정을 만들고 이름·직위·부서·지점을 맞춥니다. 대륜탑 쪽은 읽기만 하고 바꾸지 않습니다. 매일 아침 6시에 자동으로 돌고, 지금 바로 돌릴 수도 있습니다.</Sub>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md }}>
        <View style={{ flex: 1 }}>
          <Sub>{status ? `${when ? `마지막 동기화 ${when}` : '아직 동기화한 적 없음'} · 재직 ${status.active}명${status.inactive ? ` · 중지 ${status.inactive}명` : ''}` : '서버에 연결되면 상태가 보입니다.'}</Sub>
        </View>
        <Button label={busy ? '동기화 중…' : '지금 동기화'} small disabled={busy} onPress={() => void run()} />
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
      <MembersSyncCard report={report} />
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
