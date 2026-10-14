import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { clearSyncError } from '@/core/store';
import { T } from '@/ui/kit';
import { radius, space, useColors } from '@/ui/theme';
import { useApp } from '@/ui/use-app';

/** 서버에 저장하지 못했을 때 화면 위에 사유를 잠깐 띄웁니다 (누르면 닫힘). */
export function SyncNotice() {
  const c = useColors();
  const top = useSafeAreaInsets().top;
  const error = useApp().syncError;

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearSyncError, 6000);
    return () => clearTimeout(t);
  }, [error]);

  if (!error) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: top + space.sm, left: space.md, right: space.md, alignItems: 'center' }}>
      <Pressable onPress={clearSyncError} style={{ backgroundColor: c.warnSoft, borderRadius: radius.md, padding: space.md, maxWidth: 480, width: '100%' }}>
        <T size="small" color={c.warn}>{error}</T>
      </Pressable>
    </View>
  );
}
