import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { AUTH_BOT_NAME, canReceiveAuthCodes, myCodes, secondsLeft } from '@/core/auth-codes';
import { dayKey } from '@/core/messenger';
import { canManageOpen } from '@/core/open-chat';
import { actions } from '@/core/store';
import { DayDivider } from '@/ui/chat';
import { Button, Empty, Notice, Screen } from '@/ui/kit';
import { clockTime } from '@/ui/room-row';
import { family, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

// '대륜탑 인증' 봇 대화: 인증코드만 받습니다. 답장·전달·검색·AI 읽기가 없고, 코드는 몇 분 뒤 만료됩니다.
export default function AuthCodesScreen() {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState('');
  const codes = myCodes(s.authCodes, user.id, now);
  const unread = codes.some((x) => !x.read);
  useEffect(() => {
    if (unread) actions.readAuthCodes();
  }, [unread]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!canReceiveAuthCodes(user)) return <Screen title={AUTH_BOT_NAME} back><Empty text="로펌 구성원 계정만 쓸 수 있습니다." /></Screen>;

  let lastDay = '';
  return (
    <Screen title={AUTH_BOT_NAME} back scroll={false}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
        {codes.length ? null : <Empty text="받은 인증코드가 없습니다." />}
        {codes.map((x) => {
          const left = secondsLeft(x, now);
          const day = dayKey(x.at);
          const divider = day !== lastDay ? <DayDivider at={x.at} /> : null;
          lastDay = day;
          return (
            <View key={x.id}>
              {divider}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginVertical: space.xs }}>
                <View style={{ width: 260, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, backgroundColor: c.bg, padding: space.md, gap: space.sm }}>
                  <Text style={{ ...family.semibold, fontSize: 13, color: c.sub }}>대륜탑 로그인 인증코드</Text>
                  <Text style={{ ...family.heavy, fontSize: 32, letterSpacing: 6, color: left ? c.text : c.faint, textDecorationLine: left ? 'none' : 'line-through' }}>{x.code}</Text>
                  <Text style={{ ...family.semibold, fontSize: 13, color: left ? c.accent : c.faint }}>
                    {left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} 남음` : '만료됨'}
                  </Text>
                  {left ? (
                    <Pressable
                      onPress={() => {
                        void Clipboard.setStringAsync(x.code);
                        setToast('인증코드를 복사했습니다.');
                      }}
                      style={{ borderRadius: radius.md, backgroundColor: c.surface, paddingVertical: space.sm, alignItems: 'center' }}>
                      <Text style={{ ...family.bold, fontSize: 14, color: c.text }}>코드 복사</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Text style={{ ...family.regular, fontSize: 11, color: c.faint }}>{clockTime(x.at)}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
      {toast ? <Notice text={toast} tone="accent" /> : null}
      {canManageOpen(user) ? (
        <Button
          small
          kind="soft"
          label="시연: 내 계정으로 코드 받기"
          onPress={() => {
            const r = actions.deliverAuthCode(user.id, String(Math.floor(100000 + Math.random() * 900000)));
            setToast(r.ok ? '' : r.reason);
          }}
        />
      ) : null}
    </Screen>
  );
}
