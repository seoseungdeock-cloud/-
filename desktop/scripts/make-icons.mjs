// 앱·트레이 아이콘 생성: assets/brand 의 SVG → build/icon.png(1024), build/icon.icns(Mac), build/icon.ico(Windows), 트레이용 작은 PNG.
// 사용: npm run icons   (Mac 에서 돌리면 iconutil 로 icns 까지, 다른 OS 에서는 png/ico 만 — electron-builder 가 나머지를 만듦)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const here = path.dirname(new URL(import.meta.url).pathname);
const brand = path.resolve(here, '../../assets/brand');
const out = path.resolve(here, '../build');
fs.mkdirSync(out, { recursive: true });

// 1) 앱 아이콘: 흰 타일 위 두 톤 심볼. Mac 은 모서리를 운영체제가 둥글게 하지 않으므로 직접 둥글림(22%).
const appSvg = fs.readFileSync(path.join(brand, 'skynet-appicon.svg'));
const S = 1024;
const rounded = Buffer.from(`<svg width="${S}" height="${S}"><rect width="${S}" height="${S}" rx="${Math.round(S * 0.22)}" fill="#fff"/></svg>`);
const app1024 = await sharp(appSvg).resize(S, S).composite([{ input: rounded, blend: 'dest-in' }]).png().toBuffer();
fs.writeFileSync(path.join(out, 'icon.png'), app1024);

// 2) Windows .ico — 여러 크기를 한 파일에 (sharp 는 ico 를 못 쓰므로 직접 묶음)
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = await Promise.all(sizes.map((s) => sharp(app1024).resize(s, s).png().toBuffer()));
fs.writeFileSync(path.join(out, 'icon.ico'), buildIco(sizes, pngs));

// 3) Mac .icns (iconutil 이 있을 때만)
try {
  const iconset = path.join(out, 'icon.iconset');
  fs.rmSync(iconset, { recursive: true, force: true });
  fs.mkdirSync(iconset);
  for (const [name, s] of [['16x16', 16], ['16x16@2x', 32], ['32x32', 32], ['32x32@2x', 64], ['128x128', 128], ['128x128@2x', 256], ['256x256', 256], ['256x256@2x', 512], ['512x512', 512], ['512x512@2x', 1024]]) {
    fs.writeFileSync(path.join(iconset, `icon_${name}.png`), await sharp(app1024).resize(s, s).png().toBuffer());
  }
  execSync(`iconutil -c icns "${iconset}" -o "${path.join(out, 'icon.icns')}"`);
  fs.rmSync(iconset, { recursive: true, force: true });
  console.log('icon.icns 생성');
} catch {
  console.log('iconutil 없음 — icns 는 electron-builder 가 icon.png 로 만듭니다');
}

// 4) 트레이: Mac 은 검정 단색 템플릿(운영체제가 밝기 맞춤), Windows 는 색 있는 심볼
const symbolSvg = fs.readFileSync(path.join(brand, 'skynet-symbol.svg'), 'utf8');
const monoSvg = symbolSvg.replace(/fill="#2E5BFF"/g, 'fill="#000"').replace(/fill="#0B1220"/g, 'fill="#000"');
for (const [name, s] of [['trayTemplate.png', 22], ['trayTemplate@2x.png', 44]]) {
  fs.writeFileSync(path.join(out, name), await sharp(Buffer.from(monoSvg)).resize(s, s).png().toBuffer());
}
fs.writeFileSync(path.join(out, 'tray.png'), await sharp(Buffer.from(symbolSvg)).resize(32, 32).png().toBuffer());
console.log('아이콘 생성 완료 →', out);

/** PNG 들을 ICO 컨테이너로 묶기 (ICONDIR + ICONDIRENTRY*n + PNG 데이터) */
function buildIco(sizes, pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  const entries = [];
  let offset = 6 + 16 * sizes.length;
  sizes.forEach((s, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(s >= 256 ? 0 : s, 0); e.writeUInt8(s >= 256 ? 0 : s, 1);
    e.writeUInt8(0, 2); e.writeUInt8(0, 3); e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    entries.push(e);
  });
  return Buffer.concat([header, ...entries, ...pngs]);
}
