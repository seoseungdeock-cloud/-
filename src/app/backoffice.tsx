import { useState } from 'react';
import { Switch, useWindowDimensions, View } from 'react-native';

import { OFFICES } from '@/core/offices';
import { actions } from '@/core/store';
import type { Role } from '@/core/types';
import { Badge, Button, Card, Chip, Chips, Empty, Input, Notice, Screen, Section, Sub, T } from '@/ui/kit';
import { space } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

const ROLES: { key: Role; label: string }[] = [
  { key: 'client', label: '의뢰인' },
  { key: 'lawyer', label: '변호사' },
  { key: 'staff', label: '직원' },
  { key: 'admin', label: '어드민' },
];

/** 백오피스: 계정 발급과 관리. 지금은 앱 안 화면이고, 서버가 붙으면 별도 웹 관리자 페이지로 분리할 수 있습니다. */
export default function BackofficeScreen() {
  const s = useApp();
  const user = useMe();
  const { width } = useWindowDimensions();
  const [msg, setMsg] = useState<{ text: string; ok: boolean }>();
  const [form, setForm] = useState({ loginId: '', password: '', nickname: '', role: 'client' as Role, officeId: '', firm: '대륜' });
  const [resetFor, setResetFor] = useState<string>();
  const [newPw, setNewPw] = useState('');
  const [query, setQuery] = useState('');

  if (user.role !== 'admin') return <Screen title="백오피스" back><Empty text="어드민만 볼 수 있습니다." /></Screen>;

  const report = (r: { ok: boolean; reason?: string }, okText: string) => setMsg(r.ok ? { text: okText, ok: true } : { text: (r as { reason: string }).reason, ok: false });

  const rows = s.accounts
    .map((a) => ({ a, u: s.users.find((x) => x.id === a.userId)! }))
    .filter(({ a, u }) => !query.trim() || a.loginId.includes(query.trim()) || u.nickname.includes(query.trim()));

  return (
    <Screen title="백오피스" back>
      <Sub>계정 {s.accounts.length}개 · 사용 중 {s.accounts.filter((a) => a.active).length}개</Sub>
      {msg ? <View style={{ marginTop: space.md }}><Notice text={msg.text} tone={msg.ok ? 'accent' : 'warn'} /></View> : null}

      <Section title="계정 만들기">
        <View style={{ flexDirection: width > 640 ? 'row' : 'column', gap: space.sm }}>
          <View style={{ flex: 1 }}><Input label="아이디" autoCapitalize="none" value={form.loginId} onChangeText={(loginId) => setForm((f) => ({ ...f, loginId }))} /></View>
          <View style={{ flex: 1 }}><Input label="초기 비밀번호 (8자 이상)" value={form.password} onChangeText={(password) => setForm((f) => ({ ...f, password }))} /></View>
          <View style={{ flex: 1 }}><Input label="이름" value={form.nickname} onChangeText={(nickname) => setForm((f) => ({ ...f, nickname }))} /></View>
        </View>
        <Sub>역할</Sub>
        <Chips>
          {ROLES.map((r) => <Chip key={r.key} label={r.label} active={form.role === r.key} onPress={() => setForm((f) => ({ ...f, role: r.key }))} />)}
        </Chips>
        {form.role === 'lawyer' || form.role === 'staff' ? (
          <>
            <Input label="소속 법무법인" value={form.firm} onChangeText={(firm) => setForm((f) => ({ ...f, firm }))} />
            <Sub>소속 사무소</Sub>
            <Chips>
              {OFFICES.map((o) => <Chip key={o.id} label={o.name} active={form.officeId === o.id} onPress={() => setForm((f) => ({ ...f, officeId: o.id }))} />)}
            </Chips>
          </>
        ) : null}
        <Button
          label="계정 만들기"
          onPress={() => {
            const r = actions.createAccount({ ...form, officeId: form.officeId || undefined });
            report(r, `${form.loginId} 계정을 만들었습니다.`);
            if (r.ok) setForm({ loginId: '', password: '', nickname: '', role: 'client', officeId: '', firm: '대륜' });
          }}
        />
      </Section>

      <Section title="계정 목록">
        <Input placeholder="아이디·이름 검색" value={query} onChangeText={setQuery} />
        {rows.map(({ a, u }) => (
          <Card key={a.userId}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
              <T bold>{u.nickname}</T>
              <Sub>{a.loginId}</Sub>
              <Badge label={a.active ? '사용 중' : '중지됨'} tone={a.active ? 'secure' : 'warn'} />
            </View>
            <Sub>만든 날 {a.createdAt.slice(0, 10)} · 최근 로그인 {a.lastLoginAt ? a.lastLoginAt.slice(0, 16).replace('T', ' ') : '없음'}</Sub>
            <View style={{ marginTop: space.sm }}>
              <Chips>
                {ROLES.map((r) => (
                  <Chip key={r.key} label={r.label} active={u.role === r.key} onPress={() => report(actions.setRole(u.id, r.key), `${u.nickname} 역할을 ${r.label}(으)로 바꿨습니다.`)} />
                ))}
              </Chips>
            </View>
            {u.role === 'lawyer' || u.role === 'staff' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
                <Switch value={u.agentAccess} onValueChange={(v) => report(actions.setAgentAccess(u.id, v), v ? `${u.nickname}님에게 업무 AI를 허용했습니다.` : `${u.nickname}님의 업무 AI 권한을 해제했습니다.`)} />
                <Sub>경영 에이전트·마케팅 AI 사용</Sub>
              </View>
            ) : null}
            {resetFor === u.id ? (
              <View>
                <Input placeholder="새 비밀번호 (8자 이상)" value={newPw} onChangeText={setNewPw} />
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Button label="저장" small onPress={() => { const r = actions.resetPassword(u.id, newPw); report(r, `${a.loginId} 비밀번호를 바꿨습니다.`); if (r.ok) { setResetFor(undefined); setNewPw(''); } }} />
                  <Button label="취소" kind="ghost" small onPress={() => setResetFor(undefined)} />
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button label="비밀번호 초기화" kind="soft" small onPress={() => { setResetFor(u.id); setNewPw(''); }} />
                <Button
                  label={a.active ? '사용 중지' : '다시 사용'}
                  kind="ghost"
                  small
                  onPress={() => report(actions.setAccountActive(u.id, !a.active), a.active ? `${a.loginId} 계정을 중지했습니다.` : `${a.loginId} 계정을 다시 열었습니다.`)}
                />
              </View>
            )}
          </Card>
        ))}
      </Section>
    </Screen>
  );
}
