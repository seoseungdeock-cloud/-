// 백오피스 → 배당 안내: 배당표 엑셀을 올리면 사건방을 찾아 보여 주고, 확인한 줄만 사건방에 '배당 안내' 카드로 올립니다.
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { assignText, matchAssignments, parseAssignSheet, type AssignMatch } from '@/core/assign';
import { readTableFile } from '@/core/daeryuntop';
import { actions } from '@/core/store';
import { Badge, Button, Card, Chip, Chips, Notice, Sub, T } from '@/ui/kit';
import { space, useColors } from '@/ui/theme';

function pickFile(): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.csv,.html,.htm';
    input.onchange = () => resolve(input.files?.[0]);
    input.click();
  });
}

export function AssignSection({ report }: { report: (r: { ok: boolean; reason?: string }, okText: string) => void }) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<(AssignMatch & { on: boolean })[]>([]);

  const upload = async () => {
    const file = await pickFile();
    if (!file) return;
    setBusy(true);
    try {
      const { entries, error } = parseAssignSheet(await readTableFile(await file.arrayBuffer()));
      if (error) return report({ ok: false, reason: error }, '');
      const matches = matchAssignments(entries, await actions.assignRooms());
      setRows(matches.map((m) => ({ ...m, on: !!m.roomId })));
      report({ ok: true }, `배당 ${entries.length}줄 · 사건방을 찾은 줄 ${matches.filter((m) => m.roomId).length}`);
    } catch (e) {
      report({ ok: false, reason: (e as Error).message || '파일을 읽지 못했습니다.' }, '');
    } finally {
      setBusy(false);
    }
  };

  const chosen = rows.filter((r) => r.on && r.roomId);
  const send = async () => {
    setBusy(true);
    const r = await actions.postAssignNotices(chosen.map((x) => ({ roomId: x.roomId!, entry: x.entry })));
    setBusy(false);
    if (r.failed.length) report({ ok: false, reason: `${r.ok}건 올림 · ${r.failed.length}건 실패: ${r.failed[0].reason}` }, '');
    else report({ ok: true }, `사건방 ${r.ok}곳에 배당 안내를 올렸습니다.`);
    if (r.ok) setRows((rs) => rs.map((x) => (x.on && x.roomId ? { ...x, on: false } : x)));
  };
  const patch = (i: number, p: Partial<AssignMatch & { on: boolean }>) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, ...p } : x)));

  if (Platform.OS !== 'web') return <Notice text="배당표 올리기는 PC 웹에서 할 수 있습니다." />;
  return (
    <View style={{ marginTop: space.md, gap: space.sm }}>
      <Button label={busy ? '읽는 중…' : '배당표 엑셀 올리기'} disabled={busy} onPress={() => void upload()} />
      {rows.length ? (
        <>
          {rows.map((m, i) => {
            const room = m.candidates.find((r) => r.id === m.roomId);
            return (
              <Card key={`${m.entry.row}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Badge label={m.entry.reassign ? '재배당' : '배당'} tone={m.entry.reassign ? 'accent' : 'plain'} />
                  <T bold>{m.entry.client} · {m.entry.caseName}</T>
                </View>
                <Sub>{[m.entry.section, m.entry.court, m.entry.lawyers.join(', ')].filter(Boolean).join(' · ')}</Sub>
                {m.candidates.length > 1 ? (
                  <Chips>
                    {m.candidates.map((r) => (
                      <Chip key={r.id} label={r.title} active={m.roomId === r.id} onPress={() => patch(i, { roomId: r.id, on: true })} />
                    ))}
                  </Chips>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs }}>
                  <T size="small" color={room ? c.secure : c.faint}>{room ? `→ ${room.title}` : m.candidates.length ? '사건방을 골라 주세요' : '이 의뢰인의 사건방이 없습니다'}</T>
                  {room ? <View style={{ marginLeft: 'auto' }}><Chip label={m.on ? '올림' : '뺌'} active={m.on} onPress={() => patch(i, { on: !m.on })} /></View> : null}
                </View>
                {room && m.on ? <Sub>{assignText(m.entry).replace(/\n/g, ' · ')}</Sub> : null}
              </Card>
            );
          })}
          <Button label={busy ? '올리는 중…' : `고른 ${chosen.length}건 사건방에 올리기`} disabled={busy || !chosen.length} onPress={() => void send()} />
        </>
      ) : null}
    </View>
  );
}
