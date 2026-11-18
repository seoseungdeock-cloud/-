# SKYNET brand assets

심볼은 **「하늘의 그물」** — 원(하늘) 하나를 같은 기울기의 밴드 셋(그물)으로 짠 것. 가운데 밴드만 파랑.
글자가 아닌 추상 기호이며, SKYZAI 심볼(두 사선)과 같은 60° 사선이라 나란히 두면 한 가족으로 읽힌다.
워드마크는 **Pretendard Bold**(orioncactus, SIL OFL 1.1)를 아웃라인으로 변환한 것 — `SKY` 잉크 · `NET` 파랑.

| 파일 | 용도 |
|---|---|
| `skynet-lockup.svg` | 기본 — 심볼 + 1행 워드마크 수평 |
| `skynet-lockup-white.svg` | 어두운 바탕용 (흰색 + 연파랑) |
| `skynet-symbol.svg` / `-white.svg` | 심볼 단독 (1:1) |
| `skynet-favicon.svg` | 파비콘 · 흰 타일(둥글기 42) 위 두 색 심볼 |
| `skynet-appicon.svg` | 앱 아이콘 소스 (정사각, 여백 22%) → `assets/images/icon.png` |
| `skynet-appicon-maskable.svg` | PWA maskable 소스 (안전영역, 여백 30%) → `public/icon-maskable-*.png` |
| `generate.py` | 위 파일과 `src/ui/brand-data.ts` 를 만드는 생성기 |

## 규격
- 심볼: 200×200 좌표계. 원 r92 · 밴드 폭 34 · 간격 22 · 기울기 60° · 밴드 셋 중 가운데가 파랑.
- 색: 잉크 `#0B1220` · 파랑 `#2E5BFF` · 어두운 바탕용 연파랑 `#7D9BFF`. 파란 바탕 위에서는 전부 흰색.
- 락업: 심볼 높이 = 워드마크 글자 높이 × 1.3, 심볼–워드마크 간격 = 심볼 높이 × 0.24.
- 앱 안에서는 PNG 를 쓰지 않고 `src/ui/brand.tsx` 가 `brand-data.ts` 의 경로를 react-native-svg 로 그린다 (라이트/다크/어두운 사이드바 자동).
  - 사이드바 글자 높이 22 · 로그인 브랜드 판 26 · 태블릿 아이콘 메뉴는 심볼만 30.
- 최소 크기: 심볼 16px 까지 줄무늬 원으로 읽힘. 워드마크는 글자 높이 12px 아래로 쓰지 않는다.

## 다시 뽑기
```
# Pretendard Bold 가변 폰트에서 뽑기 (한 번만)
python3 -c "from fontTools.ttLib import TTFont; from fontTools.varLib import instancer; f=TTFont('PretendardVariable.ttf'); instancer.instantiateVariableFont(f,{'wght':700}).save('Pretendard-Bold.ttf')"
PRETENDARD_BOLD=Pretendard-Bold.ttf TSX_OUT=../../src/ui/brand-data.ts python3 generate.py .
# 래스터: rsvg-convert 로 icon.png(1024) · favicon.png(48) · splash-icon.png(240) · public/icon-*.png · 안드로이드 적응형(512/432)
```
