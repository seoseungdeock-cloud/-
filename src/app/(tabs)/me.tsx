import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { presenceOf } from '@/core/messenger';
import { canSeeSuggestions } from '@/core/rooms';
import { actions } from '@/core/store';
import { enableWebPush, webPushState } from '@/core/web-push';
import { callerEntries } from '@/core/caller-names';
import { callerNamesOn, callerSyncSupported, clearCallerNames, syncCallerNames } from '@/ui/caller-sync';
import { Icon } from '@/ui/icons';
import { usePresenceBadge } from '@/ui/presence';
import { Avatar, Badge, Button, Card, Chip, Chips, Screen, Section, Sub, T } from '@/ui/kit';
import { Appear, Press } from '@/ui/motion';
import { family, font, radius, setThemeMode, space, THEME_MODES, tracking, useColors, useThemeMode } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';
import { FRAME_SIZES, setFrameSize, useFrameSize, useLayout } from '@/ui/web-frame';
import { promptInstall, useInstallState } from '@/core/install';

export const ROLE_LABEL = { client: '의뢰인', lawyer: '변호사', staff: '직원', admin: '어드민' } as const;

export default function MeScreen() {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const dot = usePresenceBadge();
  const account = s.accounts.find((a) => a.userId === user.id);
  const open = s.suggestions.filter((x) => x.status === 'open').length;
  return (
    <Screen title="MY">
      {/* 프로필: 남색 판 위에 사진·이름·직위. 누르면 편집으로 */}
      <Appear>
        <Press onPress={() => router.push('/profile')} scale={0.985} style={{ borderRadius: radius.xl, padding: space.lg + 4, marginBottom: space.md, backgroundColor: c.navBg, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', right: -40, top: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: c.navActive }} />
          <View style={{ position: 'absolute', right: 40, bottom: -80, width: 140, height: 140, borderRadius: 70, backgroundColor: c.navHover }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
            <View style={{ borderRadius: 40, borderWidth: 3, borderColor: 'rgba(255,255,255,0.25)' }}>
              <Avatar name={user.nickname} uri={user.photo} size={64} badge={user.role === 'client' ? undefined : dot(user)} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ ...family.heavy, fontSize: font.h2, color: c.navText, letterSpacing: tracking.h2 }}>{user.nickname}</Text>
              <Text style={{ ...family.regular, fontSize: font.small, color: c.navMute }}>{[user.role === 'client' ? '' : presenceOf(user).label, user.status].filter(Boolean).join(' · ') || ROLE_LABEL[user.role]}</Text>
              <Text style={{ ...family.regular, fontSize: font.tiny, color: c.navMute }}>{[user.title, user.dept, account?.loginId].filter(Boolean).join(' · ')}</Text>
            </View>
            <View style={{ paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ ...family.semibold, fontSize: 13, color: c.navText }}>편집</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.md, flexWrap: 'wrap' }}>
            <Tag label={ROLE_LABEL[user.role]} />
            {user.superAdmin && user.role === 'admin' ? <Tag label="관리자어드민" /> : null}
          </View>
        </Press>
      </Appear>
      <Appear index={1}>
        <Card onPress={() => router.push({ pathname: '/room/[id]', params: { id: actions.openSelfChat() } })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="chat" color={c.accent} size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <T bold>나와의 메시지</T>
              <Sub>메모·파일을 나에게 보내 두는 대화방</Sub>
            </View>
            <Icon name="chevron" color={c.faint} size={18} />
          </View>
        </Card>
      </Appear>
      <WebPushCard />
      <InstallCard />
      <CallerNamesCard />
      <ThemeModeCard />
      <FrameSizeCard />
      <Appear index={2}>
      <Section title="스카이넷 건의사항">
        <Card onPress={() => router.push('/suggest')}>
          <T bold>건의사항 쓰기</T>
        </Card>
      </Section>
      </Appear>
      {user.role === 'admin' ? (
        <Section title="관리">
          <Card onPress={() => router.push('/backoffice')}>
            <T bold>백오피스</T>
          </Card>
          {canSeeSuggestions(user) ? (
            <Card onPress={() => router.push('/suggest/inbox')}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <T bold>건의사항함</T>
                {open ? <Badge label={`새 건의 ${open}`} /> : null}
              </View>
            </Card>
          ) : null}
        </Section>
      ) : null}
      <View style={{ marginTop: space.xl }}>
        <Button label="로그아웃" kind="ghost" onPress={() => { actions.logout(); router.replace('/login'); }} />
      </View>
    </Screen>
  );
}

/** 남색 판 위의 작은 표 */
function Tag({ label }: { label: string }) {
  const c = useColors();
  return (
    <View style={{ paddingHorizontal: 8, height: 22, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center' }}>
      <Text style={{ ...family.semibold, fontSize: font.tiny, color: c.navText }}>{label}</Text>
    </View>
  );
}
/** PC·웹 브라우저에서만: 이 브라우저로 새 메시지·기일 알림 받기 */
function WebPushCard() {
  const [state, setState] = useState(webPushState());
  if (state === 'unsupported') return null;
  return (
    <Section title="이 PC 알림">
      <Card onPress={state === 'default' ? () => void enableWebPush().then(setState) : undefined}>
        <T bold>{state === 'granted' ? '알림 받는 중' : state === 'denied' ? '알림이 차단됨' : '알림 받기'}</T>
        {state === 'denied' ? <Sub>브라우저 주소창 왼쪽 자물쇠 아이콘에서 알림을 허용해 주세요.</Sub> : null}
      </Card>
    </Section>
  );
}

/** 앱에서만 (의뢰인 계정 제외): 사건방 의뢰인 번호를 폰 연락처에 넣어 전화 올 때 이름이 뜨게 */
function CallerNamesCard() {
  const s = useApp();
  const user = useMe();
  const [on, setOn] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    void callerNamesOn().then(setOn);
  }, []);
  if (!callerSyncSupported || user.role === 'client') return null;
  const entries = callerEntries(s.rooms, s.users, user.id);
  const toggle = async () => {
    if (on) {
      await clearCallerNames();
      setOn(false);
      setNote('넣어 둔 의뢰인 연락처를 지웠습니다.');
      return;
    }
    const r = await syncCallerNames(entries);
    setOn(r.ok);
    setNote(r.ok ? `의뢰인 ${r.count}명을 연락처에 넣었습니다.` : r.reason ?? '');
  };
  return (
    <Section title="전화 올 때 의뢰인 이름">
      <Card onPress={on === null ? undefined : () => void toggle()}>
        <T bold>{on ? '켜짐 · 누르면 끄기' : '꺼짐 · 누르면 켜기'}</T>
        <Sub>{note || `내 사건방 의뢰인 ${entries.length}명의 번호를 폰 연락처에 '의뢰인 이름 · 사건'으로 넣어 둡니다. 끄면 모두 지웁니다.`}</Sub>
      </Card>
    </Section>
  );
}

/** 화면 모드: 자동(기기 설정) / 라이트 / 다크 */
function ThemeModeCard() {
  const mode = useThemeMode();
  return (
    <Section title="화면 모드">
      <Chips>
        {THEME_MODES.map((m) => <Chip key={m.key} label={m.label} active={mode === m.key} onPress={() => setThemeMode(m.key)} />)}
      </Chips>
    </Section>
  );
}

/** PC·웹 브라우저에서만: 화면 구성 (자동 / 데스크톱 / 모바일) */
function FrameSizeCard() {
  const size = useFrameSize();
  const { mode } = useLayout();
  if (Platform.OS !== 'web') return null;
  const now = { phone: '모바일', tablet: '태블릿(아이콘 메뉴)', desktop: '데스크톱' }[mode];
  return (
    <Section title="화면 구성">
      <Chips>
        {FRAME_SIZES.map((f) => <Chip key={f.key} label={f.label} active={size === f.key} onPress={() => setFrameSize(f.key)} />)}
      </Chips>
      <Sub>{FRAME_SIZES.find((f) => f.key === size)!.hint} · 지금은 {now} 구성입니다.</Sub>
    </Section>
  );
}

/** PC 웹 브라우저(크롬·엣지)에서만: 데스크톱 앱으로 설치 */
function InstallCard() {
  const state = useInstallState();
  if (state === 'unsupported') return null;
  return (
    <Section title="PC 앱">
      <Card onPress={state === 'available' ? () => void promptInstall() : undefined}>
        <T bold>{state === 'installed' ? 'PC 앱으로 쓰는 중' : 'PC 앱으로 설치'}</T>
        <Sub>{state === 'installed' ? '바탕화면·작업표시줄의 스카이넷 아이콘으로 엽니다.' : '주소창 없는 앱 창으로 열리고, 작업표시줄·독에 고정할 수 있습니다. 화면과 알림은 웹과 같습니다.'}</Sub>
      </Card>
    </Section>
  );
}
