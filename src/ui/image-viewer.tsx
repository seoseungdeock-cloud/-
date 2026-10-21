// 사진 크게 보기 (웍스 사진 창처럼): 검은 화면, 이전·다음, 확대·축소·회전, 저장, 원본으로 보기
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Image, Modal, Platform, Pressable, Text, View } from 'react-native';

import type { Attachment } from '@/core/types';
import { downloadFile, openFile } from './board';
import { Icon, type IconName } from './icons';
import { family, radius, space } from './theme';

type Viewer = { items: Attachment[]; index: number; title: string } | null;
let current: Viewer = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** 사진을 누르면 이 창으로 엽니다 (같은 대화의 다른 사진은 좌우로 넘김) */
export function openViewer(items: Attachment[], index: number, title = '') {
  current = { items, index: Math.max(0, index), title };
  emit();
}
const close = () => {
  current = null;
  emit();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function ImageViewerHost() {
  const v = useSyncExternalStore(subscribe, () => current, () => null);
  if (!v) return null;
  return <ViewerWindow key={`${v.items[0]?.id}-${v.index}`} v={v} />;
}

function ViewerWindow({ v }: { v: NonNullable<Viewer> }) {
  const [index, setIndex] = useState(v.index);
  const [zoom, setZoom] = useState(1);
  const [turn, setTurn] = useState(0);
  const [toast, setToast] = useState('');
  const a = v.items[index];
  const copy = () => {
    void copyImage(a.uri).then((ok) => setToast(ok ? '사진을 복사했습니다' : '이 브라우저에서는 사진 복사가 되지 않습니다'));
  };
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 1600);
    return () => clearTimeout(t);
  }, [toast]);
  const go = (n: number) => {
    const next = index + n;
    if (next < 0 || next >= v.items.length) return;
    setIndex(next);
    setZoom(1);
    setTurn(0);
  };
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!a) return null;
  const tool = (icon: IconName | 'fit' | 'minus' | 'rotate', label: string, onPress: () => void) => (
    <Pressable key={label} accessibilityLabel={label} onPress={onPress} hitSlop={6} style={(st) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: (st as { hovered?: boolean }).hovered ? 'rgba(255,255,255,0.12)' : 'transparent' })}>
      {icon === 'fit' ? <Text style={{ color: '#FFFFFF', fontSize: 18, ...family.semibold }}>⤢</Text> : icon === 'minus' ? <Text style={{ color: '#FFFFFF', fontSize: 24, ...family.regular }}>−</Text> : icon === 'rotate' ? <Text style={{ color: '#FFFFFF', fontSize: 20, ...family.semibold }}>↻</Text> : <Icon name={icon} color="#FFFFFF" size={22} />}
    </Pressable>
  );
  const arrow = (dir: 1 | -1) =>
    (dir < 0 ? index > 0 : index < v.items.length - 1) ? (
      <Pressable accessibilityLabel={dir < 0 ? '이전 사진' : '다음 사진'} onPress={() => go(dir)} style={{ position: 'absolute', top: '50%', marginTop: -24, [dir < 0 ? 'left' : 'right']: space.md, width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={dir < 0 ? 'back' : 'chevron'} color="#FFFFFF" size={26} />
      </Pressable>
    ) : null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: '#0E0F11' }}>
        <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, gap: space.sm }}>
          <Text numberOfLines={1} style={{ flex: 1, textAlign: 'center', color: '#FFFFFF', fontSize: 13, ...family.semibold }}>
            {v.title ? `${v.title} · ` : ''}
            {a.name}
            {v.items.length > 1 ? `  (${index + 1}/${v.items.length})` : ''}
          </Text>
          <Pressable accessibilityLabel="닫기" onPress={close} hitSlop={10} style={{ position: 'absolute', right: space.md }}>
            <Icon name="close" color="#FFFFFF" size={22} />
          </Pressable>
        </View>
        <View style={{ flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          <Image source={{ uri: a.uri }} resizeMode="contain" accessibilityLabel={a.name} style={{ width: '100%', height: '100%', transform: [{ scale: zoom }, { rotate: `${turn}deg` }] }} />
          {arrow(-1)}
          {arrow(1)}
          {toast ? (
            <View style={{ position: 'absolute', bottom: space.lg, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
              <Text style={{ color: '#111', fontSize: 13, ...family.semibold }}>{toast}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ height: 76, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 4 }}>
            {tool('fit', '화면에 맞추기', () => { setZoom(1); setTurn(0); })}
            {tool('minus', '축소', () => setZoom((z) => Math.max(0.25, z / 1.25)))}
            {tool('plus', '확대', () => setZoom((z) => Math.min(6, z * 1.25)))}
            {tool('rotate', '회전', () => setTurn((t) => (t + 90) % 360))}
            {Platform.OS === 'web' ? tool('copy', '복사', copy) : null}
            {tool('down', '저장', () => downloadFile(a))}
          </View>
          <Pressable onPress={() => openFile(a)} style={{ position: 'absolute', right: space.lg, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 13, ...family.semibold }}>원본으로 보기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** 사진을 컴퓨터 클립보드에 (PNG로 바꿔서 넣어야 대부분의 프로그램에 붙여 넣어집니다) */
async function copyImage(uri: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    const png = (async () => {
      const blob = await (await fetch(uri)).blob();
      if (blob.type === 'image/png') return blob;
      const bmp = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      canvas.getContext('2d')!.drawImage(bmp, 0, 0);
      return await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error('png'))), 'image/png'));
    })();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  } catch {
    return false;
  }
}
