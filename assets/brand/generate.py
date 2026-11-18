#!/usr/bin/env python3
"""SKYNET 브랜드 SVG 생성기.
심볼 「하늘의 그물」: 원(하늘) 하나를 같은 기울기의 밴드 셋(그물)으로 짠다. 가운데 밴드가 파랑.
  200 그리드 · 원 r92 · 밴드 폭 34 · 간격 22 · 기울기 60° (SKYZAI 의 사선과 같은 각도라 형제로 읽힌다). 글자가 아닌 추상 기호.
워드마크는 Pretendard Bold(SIL OFL 1.1)를 아웃라인으로 변환한 1행 대문자 — SKY 잉크 · NET 파랑 (SKYZAI 의 SKYZ·AI 와 같은 규칙).
사용: PRETENDARD_BOLD=<Pretendard-Bold.ttf> TSX_OUT=../../src/ui/brand-data.ts python3 generate.py .
"""
import math, os, sys
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)
FONT = os.environ.get('PRETENDARD_BOLD', 'Pretendard-Bold.ttf')  # 가변 폰트(PretendardVariable.ttf)는 fontTools.varLib.instancer 로 wght=700 을 뽑아 쓴다
INK = '#0B1220'
PRIMARY = '#2E5BFF'
PRIMARY_LIGHT = '#7D9BFF'
WHITE = '#FFFFFF'
BRAND = 'SKYNET'
SLUG = 'skynet'

# ───────────── 심볼 ─────────────
RADIUS, BAND_W, BAND_GAP, ANGLE, N_BANDS, BLUE_INDEX = 92, 34, 22, 60, 3, 1

def band_pts(cx, angle_deg, width, length=600, cy=100):
    a = math.radians(angle_deg); dx, dy = math.cos(a), -math.sin(a); nx, ny = -dy, dx
    hw, hl = width / 2, length / 2
    return [(cx + dx * hl * sx + nx * hw * sy, cy + dy * hl * sx + ny * hw * sy) for sx, sy in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]

def poly(pts):
    return 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts) + ' Z'

def symbol_bands():
    """[(path d, role)] — 원으로 잘라내기 전의 밴드 셋. 법선 방향으로 (폭+간격) 씩 어긋남."""
    pitch = BAND_W + BAND_GAP
    out = []
    for k in range(N_BANDS):
        off = (k - (N_BANDS - 1) / 2) * pitch / math.sin(math.radians(ANGLE))
        out.append((poly(band_pts(100 + off, ANGLE, BAND_W)), 'primary' if k == BLUE_INDEX else 'ink'))
    return out

def symbol_svg(_kind=None, scale=1.0, tx=0.0, ty=0.0, colors=None, uid='s'):
    c = colors or {'ink': INK, 'primary': PRIMARY}
    parts = [f'  <defs><clipPath id="disc-{uid}"><circle cx="100" cy="100" r="{RADIUS}"/></clipPath></defs>',
             f'  <g transform="translate({tx:.2f},{ty:.2f}) scale({scale:.4f})"><g clip-path="url(#disc-{uid})">']
    for d, role in symbol_bands():
        parts.append(f'    <path d="{d}" fill="{c[role]}"/>')
    parts.append('  </g></g>')
    return '\n'.join(parts)

# ───────────── 워드마크 ─────────────
def load(p):
    f = TTFont(p)
    return f.getGlyphSet(), f.getBestCmap()
KR = load(FONT)
SEGMENTS = [('SKY', 'ink', 8, 0), ('NET', 'primary', 8, 0)]

def run(text, track, fnt):
    glyphs, cmap = fnt
    items, x = [], 0
    ymin, ymax = math.inf, -math.inf
    for i, ch in enumerate(text):
        g = glyphs[cmap[ord(ch)]]
        pen = SVGPathPen(glyphs, ntos=lambda v: repr(round(v, 1)))
        g.draw(pen)
        bp = BoundsPen(glyphs); g.draw(bp)
        if bp.bounds:
            ymin, ymax = min(ymin, bp.bounds[1]), max(ymax, bp.bounds[3])
        items.append((pen.getCommands(), x))
        x += g.width + (track if i < len(text) - 1 else 0)
    return items, x, ymin, ymax

LAID, _x, _top, _bot = [], 0, -math.inf, math.inf
for text, role, track, pre in SEGMENTS:
    _x += pre
    items, adv, ymin, ymax = run(text, track, KR)
    LAID.append((items, _x, role))
    _top, _bot = max(_top, ymax), min(_bot, ymin)
    _x += adv
WM_W, WM_H, TOP = _x, _top - _bot, _top

def wordmark_g(colors):
    out = [f'  <!--{BRAND} wordmark — Pretendard Bold, outlined-->', f'  <g transform="translate(0,{TOP:.0f}) scale(1,-1)">']
    for items, x0, role in LAID:
        out.append(f'    <g transform="translate({x0:.0f},0)" fill="{colors[role]}">')
        for d, x in items:
            out.append(f'      <g transform="translate({x:.0f},0)"><path d="{d}"/></g>')
        out.append('    </g>')
    out.append('  </g>')
    return '\n'.join(out)

SYM_RATIO = 1.3   # 심볼 높이 = 워드마크 글자 높이 × 1.3 (원이라 대문자보다 조금 커야 같은 무게로 보임)
GAP_RATIO = 0.24

def svg(w, h, body, label):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}" role="img" aria-label="{BRAND}">\n'
            f'  <title>{label}</title>\n  <desc>Wordmark drawn from Pretendard Bold (orioncactus), SIL Open Font License 1.1, converted to outlines. Symbol original — slash cut family (SKYZ).</desc>\n'
            f'{body}\n</svg>\n')

def write(name, text):
    with open(os.path.join(OUT, name), 'w') as fh: fh.write(text)

def lockup(kind, colors, suffix=''):
    sym_h = WM_H * SYM_RATIO
    gap = sym_h * GAP_RATIO
    scale = sym_h / 200
    pad = sym_h * 0.08
    total_w = sym_h + gap + WM_W + pad * 2
    total_h = sym_h + pad * 2
    wm_y = pad + (sym_h - WM_H) / 2
    body = symbol_svg(kind, scale, pad, pad, colors) + '\n' + f'  <g transform="translate({pad + sym_h + gap:.1f},{wm_y:.1f})">\n' + wordmark_g(colors) + '\n  </g>'
    write(f'{SLUG}-lockup{suffix}.svg', svg(total_w, total_h, body, f'{BRAND} horizontal lockup'))

def symbol_file(kind, colors, suffix=''):
    write(f'{SLUG}-symbol{suffix}.svg', svg(200, 200, symbol_svg(kind, 1, 0, 0, colors), f'{BRAND} symbol'))

def tile(kind, name, rx, inset, bg=WHITE, colors=None):
    """아이콘 타일. 기본은 락업과 같은 두 색(잉크 + 브랜드색)을 흰 타일 위에."""
    s = 1 - inset * 2
    colors = colors or {'ink': INK, 'primary': PRIMARY}
    body = f'  <rect width="200" height="200" rx="{rx}" fill="{bg}"/>\n' + symbol_svg(kind, s, inset * 200, inset * 200, colors)
    write(name, svg(200, 200, body, f'{BRAND} icon'))

if __name__ == '__main__':
    kind = None
    light = {'ink': INK, 'primary': PRIMARY}
    dark = {'ink': WHITE, 'primary': PRIMARY_LIGHT}
    lockup(kind, light); lockup(kind, dark, '-white')
    symbol_file(kind, light); symbol_file(kind, dark, '-white')
    tile(kind, f'{SLUG}-favicon.svg', 42, 0.16)
    tile(kind, f'{SLUG}-appicon.svg', 0, 0.2)
    tile(kind, f'{SLUG}-appicon-maskable.svg', 0, 0.28)
    print('ok', kind, OUT)


# ───────────── 앱용 데이터 모듈 (react-native-svg 로 그림) ─────────────
def emit_tsx(_kind, path_out):
    bands = symbol_bands()
    segs = []
    for items, x0, role in LAID:
        segs.append({'x': round(x0), 'role': role, 'glyphs': [{'d': d, 'x': round(x)} for d, x in items]})
    lines = ['// 자동 생성 — assets/brand/generate.py. 손으로 고치지 말고 생성기를 돌립니다.',
             '// 심볼: 200×200 좌표계. 원(r)으로 잘라낸 밴드 셋 — 가운데가 파랑. 워드마크: Pretendard Bold 아웃라인 (SIL OFL 1.1), y 가 위로 커서 scale(1,-1) 로 뒤집어 그립니다.',
             "export type BrandRole = 'ink' | 'primary';",
             f"export const SYMBOL: {{ radius: number; bands: {{ d: string; role: BrandRole }}[] }} = {{ radius: {RADIUS}, bands: [" + ', '.join(f"{{ d: '{d}', role: '{r}' }}" for d, r in bands) + '] };',
             'export const WORDMARK: { width: number; height: number; top: number; bottom: number; segments: { x: number; role: BrandRole; glyphs: { x: number; d: string }[] }[] } = {',
             f'  width: {round(WM_W)}, height: {round(WM_H)}, top: {round(TOP)}, bottom: {round(TOP - WM_H)}, segments: [']
    for sg in segs:
        lines.append(f"  {{ x: {sg['x']}, role: '{sg['role']}', glyphs: [")
        for g in sg['glyphs']:
            lines.append(f"    {{ x: {g['x']}, d: '{g['d']}' }},")
        lines.append('  ] },')
    lines.append('] };')
    lines.append(f'/** 락업 비율: 심볼 높이 = 워드마크 높이 × {SYM_RATIO}, 간격 = 심볼 높이 × {GAP_RATIO} */')
    lines.append(f'export const LOCKUP = {{ symRatio: {SYM_RATIO}, gapRatio: {GAP_RATIO} }};')
    with open(path_out, 'w') as fh: fh.write('\n'.join(lines) + '\n')

if __name__ == '__main__' and os.environ.get('TSX_OUT'):
    emit_tsx(None, os.environ['TSX_OUT'])
    print('tsx', os.environ['TSX_OUT'])
