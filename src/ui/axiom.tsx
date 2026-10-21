// 업무 탭 AXIOM 화면 공통 부품: 불러오기·되풀이 확인, 마크다운 보기, 공개 등급 고르기, 결재 카드, 실행 기록
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { axiom } from '@/core/axiom/client';
import { Badge, Button, Card, Chip, Chips, Input, Notice, Screen, Sub, T } from './kit';
import { family, font, radius, space, useColors } from './theme';
import { useMe } from './use-app';

export type R = Record<string, any>;

/** op 결과를 불러오고, poll(ms)이 있으면 화면이 열려 있는 동안 되풀이 확인합니다 */
export function useAx<T = any>(op: string, args: R = {}, opts: { poll?: (d: T) => number | false; skip?: boolean } = {}) {
  const user = useMe();
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [tick, setTick] = useState(0);
  const [focused, setFocused] = useState(false);
  const key = JSON.stringify(args);
  const skip = !!opts.skip;
  const pollRef = useRef(opts.poll);
  useEffect(() => {
    pollRef.current = opts.poll;
  });
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    if (!focused || skip) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void axiom<T>(user, op, JSON.parse(key)).then((r) => {
      if (!alive) return;
      if (!r.ok) return setError(r.reason);
      setData(r.data);
      setError(undefined);
      const ms = pollRef.current?.(r.data);
      if (ms) timer = setTimeout(() => setTick((x) => x + 1), ms);
    });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [focused, skip, key, tick, user, op]);
  const reload = useCallback(() => setTick((x) => x + 1), []);
  return { data, error, reload };
}

/** 버튼에서 부르는 요청: 처리 중 표시와 오류 문구를 함께 */
export function useAxAction() {
  const user = useMe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = useCallback(
    async <T = any,>(op: string, args: R = {}): Promise<T | undefined> => {
      setBusy(true);
      setError(undefined);
      const r = await axiom<T>(user, op, args);
      setBusy(false);
      if (r.ok) return r.data;
      setError(r.reason);
      return undefined;
    },
    [user],
  );
  return { run, busy, error, setError };
}

export function AxScreen({ title, children, right, error, loading }: { title: string; children?: ReactNode; right?: ReactNode; error?: string; loading?: boolean }) {
  return (
    <Screen title={title} back right={right}>
      {error ? <Notice text={error} /> : null}
      {loading && !error ? <Sub>불러오는 중…</Sub> : children}
    </Screen>
  );
}

export const when = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 9 * 3600e3);
  return d.toISOString().slice(0, 16).replace('T', ' ');
};
export const won = (v: unknown) => (v == null || v === '' ? '-' : Number(v).toLocaleString('ko-KR'));
export const pct = (v: number | null | undefined) => (v == null ? '-' : `${Math.round(v * 1000) / 10}%`);

// ── 마크다운 보기 (제목·목록·굵게·표·인용) ─────────────────────
function Inline({ text, color, size = 'body' }: { text: string; color?: string; size?: keyof typeof font }) {
  const c = useColors();
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <Text
      style={{
        fontSize: font[size],
        lineHeight: font[size] * 1.5,
        color: color ?? c.text,
        ...family.regular,
      }}
    >
      {parts.map((p, i) =>
        p.startsWith('**') ? (
          <Text key={i} style={{ ...family.bold }}>
            {p.slice(2, -2)}
          </Text>
        ) : p.startsWith('`') ? (
          <Text key={i} style={{ backgroundColor: c.surface }}>
            {p.slice(1, -1)}
          </Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

export function Markdown({ text }: { text: string }) {
  const c = useColors();
  const lines = String(text || '').split('\n');
  const out: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i]))
          rows.push(
            lines[i]
              .trim()
              .slice(1, -1)
              .split('|')
              .map((x) => x.trim()),
          );
        i++;
      }
      i--;
      out.push(
        <View
          key={i}
          style={{
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.line,
            borderRadius: radius.sm,
            marginVertical: space.sm,
          }}
        >
          {rows.map((r, ri) => (
            <View
              key={ri}
              style={{
                flexDirection: 'row',
                borderTopWidth: ri ? StyleSheet.hairlineWidth : 0,
                borderTopColor: c.line,
                backgroundColor: ri ? undefined : c.surface,
              }}
            >
              {r.map((cell, ci) => (
                <View key={ci} style={{ flex: 1, padding: space.xs + 2 }}>
                  <Inline text={ri ? cell : `**${cell}**`} size="small" />
                </View>
              ))}
            </View>
          ))}
        </View>,
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) {
      const size = h[1].length <= 1 ? 'h2' : 'body';
      out.push(
        <View
          key={i}
          style={{
            marginTop: h[1].length <= 2 ? space.lg : space.md,
            marginBottom: space.xs,
          }}
        >
          <T size={size} bold>
            {h[2].replace(/\*\*/g, '')}
          </T>
        </View>,
      );
      continue;
    }
    const li = /^(\s*)[-*]\s+(.*)$/.exec(l);
    if (li) {
      out.push(
        <View
          key={i}
          style={{
            flexDirection: 'row',
            paddingLeft: li[1].length * 6,
            marginBottom: 2,
          }}
        >
          <Text style={{ color: c.sub, width: 14, fontSize: font.body }}>·</Text>
          <View style={{ flex: 1 }}>
            <Inline text={li[2]} />
          </View>
        </View>,
      );
      continue;
    }
    const q = /^>\s?(.*)$/.exec(l);
    if (q) {
      out.push(
        <View
          key={i}
          style={{
            borderLeftWidth: 3,
            borderLeftColor: c.line,
            paddingLeft: space.sm,
            marginVertical: 2,
          }}
        >
          <Inline text={q[1]} color={c.sub} />
        </View>,
      );
      continue;
    }
    if (!l.trim()) {
      out.push(<View key={i} style={{ height: space.sm }} />);
      continue;
    }
    out.push(<Inline key={i} text={l} />);
  }
  return <View>{out}</View>;
}

// ── 공개 등급 ─────────────────────
export function VisibilityPicker({ value, onChange, teams }: { value: string; onChange: (v: string) => void; teams: { key: string; label: string }[] }) {
  const isCase = value.startsWith('case:');
  return (
    <View style={{ marginBottom: space.md }}>
      <Sub>공개 등급</Sub>
      <View style={{ height: space.xs }} />
      <Chips>
        <Chip label="전체" active={value === 'org'} onPress={() => onChange('org')} />
        {teams.map((t) => (
          <Chip key={t.key} label={t.label} active={value === `team:${t.key}`} onPress={() => onChange(`team:${t.key}`)} />
        ))}
        <Chip label="사건" active={isCase} onPress={() => onChange('case:')} />
        <Chip label="기밀" active={value === 'confidential'} onPress={() => onChange('confidential')} />
      </Chips>
      {isCase ? <Input placeholder="사건번호" value={value.slice(5)} onChangeText={(t) => onChange(`case:${t}`)} /> : null}
    </View>
  );
}

export function useInstance() {
  return useAx<R>('instance').data;
}

// ── 결재 카드 ─────────────────────
const TIER_TONE: Record<string, 'accent' | 'warn' | 'plain'> = {
  pre: 'accent',
  post: 'warn',
  auto: 'plain',
};
export const KIND_LABEL: Record<string, string> = {
  council_final: '경영위원회 최종안',
  work_order_pre: '작업지시 사전 승인',
  work_order_result: '작업 결과 확인',
  external_action: '외부 실행',
  report: '정기 보고',
};

export function linkOf(ref_type?: string, ref_id?: string): (() => void) | undefined {
  if (!ref_id) return undefined;
  if (ref_type === 'council') return () => router.push({ pathname: '/axiom/council/[id]', params: { id: ref_id } });
  if (ref_type === 'work_order' || ref_type === 'work_order_result' || ref_type === 'external_action')
    return () => router.push({ pathname: '/axiom/work/[id]', params: { id: ref_id } });
  if (ref_type === 'document' || ref_type === 'report') return () => router.push({ pathname: '/axiom/doc/[id]', params: { id: ref_id } });
  return undefined;
}

export function ApprovalCard({ a, onDone }: { a: R; onDone: () => void }) {
  const c = useColors();
  const { run, busy, error, setError } = useAxAction();
  const [comment, setComment] = useState('');
  const [open, setOpen] = useState(false);
  const decide = async (action: string) => {
    if (action === 'revise' && !comment.trim()) return setError('수정 요구는 무엇을 고칠지 적어 주세요.');
    const r = await run('approvals.decide', { id: a.id, action, comment });
    if (r) onDone();
  };
  const p = a.payload || {};
  const flags = Array.isArray(p.flags) ? p.flags.length : Number(p.flags) || 0;
  const asks: R[] = p.final?.decisions_needed ?? p.decisions_needed ?? [];
  const go = linkOf(a.ref_type, a.ref_id);
  return (
    <Card>
      <View
        style={{
          flexDirection: 'row',
          gap: space.xs,
          flexWrap: 'wrap',
          marginBottom: space.xs,
        }}
      >
        <Badge label={a.tier_label} tone={TIER_TONE[a.tier] ?? 'plain'} />
        <Badge label={KIND_LABEL[a.kind] ?? a.kind} tone="plain" />
        {a.team ? <Badge label={a.team_label ?? a.team} tone="plain" /> : null}
        {flags ? <Badge label={`주의 ${flags}`} tone="warn" /> : null}
      </View>
      <T bold>{a.title}</T>
      {a.summary ? <Sub>{a.summary}</Sub> : null}
      {asks.length ? (
        <View style={{ marginTop: space.sm }}>
          {asks.map((q: R, i: number) => (
            <T key={i} size="small">
              · {q.question} {q.recommendation ? `(추천: ${q.recommendation})` : ''}
            </T>
          ))}
        </View>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          gap: space.sm,
          marginTop: space.md,
          flexWrap: 'wrap',
        }}
      >
        {go ? <Button label="자세히" kind="ghost" small onPress={go} /> : null}
        {a.status === 'pending' && a.can_decide !== false ? (
          <>
            <Button label="승인" small disabled={busy} onPress={() => void decide('approve')} />
            <Button label="수정 요구" kind="soft" small disabled={busy} onPress={() => (open ? void decide('revise') : setOpen(true))} />
            <Button label="반려" kind="ghost" small disabled={busy} onPress={() => void decide('reject')} />
          </>
        ) : a.status !== 'pending' ? (
          <Badge label={a.decision === 'approve' ? '승인됨' : a.decision === 'revise' ? '수정 요구함' : a.decision === 'reject' ? '반려됨' : a.status} tone="plain" />
        ) : (
          <Sub>관리자어드민 결재</Sub>
        )}
      </View>
      {open ? (
        <View style={{ marginTop: space.sm }}>
          <Input multiline placeholder="고칠 점" value={comment} onChangeText={setComment} />
        </View>
      ) : null}
      {error ? <Text style={{ color: c.warn, fontSize: font.small, marginTop: space.xs }}>{error}</Text> : null}
    </Card>
  );
}

// ── 실행 기록 ─────────────────────
const RUN_STATUS: Record<string, string> = {
  done: '완료',
  running: '실행 중',
  failed: '실패',
};
export function RunList({ runs }: { runs: R[] }) {
  const c = useColors();
  if (!runs?.length) return <Sub>실행 기록 없음</Sub>;
  return (
    <View>
      {runs.map((r) => (
        <View
          key={r.id}
          style={{
            flexDirection: 'row',
            paddingVertical: space.xs + 2,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: c.line,
            gap: space.sm,
          }}
        >
          <View style={{ flex: 1 }}>
            <T size="small" bold>
              {r.agent_name || r.agent_slug} <Text style={{ color: c.sub, ...family.regular }}>{r.mode}</Text>
            </T>
            <Text style={{ fontSize: font.tiny, color: c.sub }}>
              {when(r.started_at)} · {r.provider || ''} {r.model || ''}
              {r.flags?.length ? ` · 주의 ${r.flags.length}` : ''}
            </Text>
            {r.error ? <Text style={{ fontSize: font.tiny, color: c.warn }}>{r.error}</Text> : null}
          </View>
          <Badge label={RUN_STATUS[r.status] ?? r.status} tone={r.status === 'done' ? 'plain' : r.status === 'running' ? 'ai' : 'warn'} />
        </View>
      ))}
    </View>
  );
}

/** 모의 응답 안내: AI 키가 없을 때만 */
export function MockNotice() {
  const s = useAx<R>('status').data;
  return s?.mock_mode ? <Notice text="AI 키가 아직 없어 모의 응답으로 움직입니다." tone="accent" /> : null;
}
