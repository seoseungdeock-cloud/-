import { hwpText, hwpxText, readCfb } from '../hwp-text';

describe('한글 파일 글 뽑기', () => {
  it('HWPX: 문단·탭·특수문자를 글로', () => {
    const enc = new TextEncoder();
    const files = {
      'Contents/section1.xml': enc.encode('<hs:sec><hp:p><hp:run><hp:t>둘째 구역</hp:t></hp:run></hp:p></hs:sec>'),
      'Contents/section0.xml': enc.encode('<hs:sec><hp:p><hp:run><hp:t>준비서면 &amp; 의견</hp:t><hp:tab/><hp:t>원고</hp:t></hp:run></hp:p><hp:p><hp:run><hp:t>피고는 &lt;주장&gt;합니다.</hp:t></hp:run></hp:p></hs:sec>'),
      'Contents/header.xml': enc.encode('<x>무시</x>'),
    };
    expect(hwpxText(new Uint8Array(), () => files)).toBe('준비서면 & 의견\t원고\n피고는 <주장>합니다.\n둘째 구역');
    expect(() => hwpxText(new Uint8Array(), () => ({}))).toThrow();
  });

  it('HWP가 아닌 파일은 거절', () => {
    expect(() => readCfb(new Uint8Array(512))).toThrow('not cfb');
    expect(() => hwpText(new Uint8Array(512), (d) => d)).toThrow();
  });
});
