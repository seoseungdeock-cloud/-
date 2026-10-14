// 대화방 목록 맨 위의 '대륜탑 인증' 봇 줄
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { AUTH_BOT_NAME, canReceiveAuthCodes, myCodes, secondsLeft, unreadCodes } from '@/core/auth-codes';
import { Icon } from './icons';
import { chatTime } from './room-row';
import { family, radius, space, useColors } from './theme';
import { useApp, useMe } from './use-app';

export function AuthBotRow() {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  if (!canReceiveAuthCodes(user)) return null;
  const now = Date.now();
  const last = myCodes(s.authCodes, user.id, now).at(-1);
  const unread = unreadCodes(s.authCodes, user.id);
  const left = last ? secondsLeft(last, now) : 0;
  return (
    <Pressable
      onPress={() => router.push('/auth-codes')}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="lock" color="#FFFFFF" size={24} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Text style={{ fontFamily: family.bold, fontSize: 16, color: c.text }}>{AUTH_BOT_NAME}</Text>
          <Text style={{ fontFamily: family.semibold, fontSize: 11, color: c.accent, borderWidth: 1, borderColor: c.accent, borderRadius: radius.pill, paddingHorizontal: 5 }}>봇</Text>
          {last ? <Text style={{ marginLeft: 'auto', fontFamily: family.regular, fontSize: 12, color: c.faint }}>{chatTime(last.at)}</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: family.regular, fontSize: 14, color: c.sub }}>
            {last ? (left ? `인증코드가 도착했습니다 · ${Math.ceil(left / 60)}분 안에 입력` : '인증코드 (만료)') : '받은 인증코드 없음'}
          </Text>
          {unread ? (
            <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 11, fontFamily: family.bold }}>{unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
