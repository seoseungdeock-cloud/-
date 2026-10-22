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

import { roomDocs } from '../room-ai';

describe('방 서면 고르기', () => {
  const msgs = [
    { roomId: 'r', senderId: 'a', at: '2026-10-22T01:00:00Z', attachments: [{ name: '소장.pdf', path: 'r/1/x.pdf' }, { name: '사진.jpg', path: 'r/1/y.jpg' }] },
    { roomId: 'r', senderId: 'b', at: '2026-10-22T02:00:00Z', attachments: [{ name: '준비서면.hwp', path: 'r/2/z.hwp' }] },
    { roomId: 'r', senderId: 'b', at: '2026-10-22T03:00:00Z', recalled: true, attachments: [{ name: '회수.pdf', path: 'r/3/w.pdf' }] },
    { roomId: 'r', senderId: 'b', at: '2026-10-22T04:00:00Z', deletedFor: ['me'], attachments: [{ name: '지운.pdf', path: 'r/4/v.pdf' }] },
    { roomId: 'o', senderId: 'b', at: '2026-10-22T05:00:00Z', attachments: [{ name: '다른방.pdf', path: 'o/5/u.pdf' }] },
  ];
  it('띠지는 PDF만, 오타는 한글도, 최근 것부터, 회수·지운 것 제외', () => {
    expect(roomDocs(msgs, 'r', 'me', 'stamp').map((d) => d.name)).toEqual(['소장.pdf']);
    expect(roomDocs(msgs, 'r', 'me', 'proof').map((d) => d.name)).toEqual(['준비서면.hwp', '소장.pdf']);
  });
});
