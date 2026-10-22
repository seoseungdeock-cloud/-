// 프로필·대화방 사진 고르기: 정사각으로 잘라 작게 줄입니다
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export async function pickSquarePhoto(): Promise<string | undefined> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
  if (res.canceled || !res.assets[0]) return undefined;
  return shrink(res.assets[0].uri);
}

/** 웹: 큰 사진을 512px 정사각 JPEG로 줄여 올립니다 (프로필 사진 상한 5MB). 휴대폰은 고르기 화면에서 이미 잘라 줄입니다. */
export async function shrink(uri: string): Promise<string> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return uri;
  try {
    const img = new window.Image();
    img.src = uri;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const out = Math.min(512, side);
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    canvas.getContext('2d')?.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return uri;
  }
}
