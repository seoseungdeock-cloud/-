import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';

import { KOREA_MAP_VIEWBOX, KOREA_REGIONS } from '@/data/korea-map';
import { family, useColors } from './theme';

// scripts/build-korea-map.mjs 와 같은 투영
const lon0 = 124.5, lat0 = 33.0, lat1 = 38.7, lon1 = 131.0;
const kx = Math.cos(((lat0 + lat1) / 2) * Math.PI / 180);
const scale = KOREA_MAP_VIEWBOX.width / ((lon1 - lon0) * kx);
export const project = (lon: number, lat: number) => ({ x: (lon - lon0) * kx * scale, y: (lat1 - lat) * scale });

type Props = {
  counts: Record<string, number>;
  selected?: string;
  onSelect: (code: string | undefined) => void;
  pins?: { id: string; lat: number; lon: number }[];
};

/** 대한민국 시·도 지도. 지역을 누르면 그 지역 변호사 목록으로 좁혀집니다. */
export function KoreaMap({ counts, selected, onSelect, pins = [] }: Props) {
  const c = useColors();
  const { width, height } = KOREA_MAP_VIEWBOX;
  return (
    <Svg width="100%" height={undefined} viewBox={`0 0 ${width} ${height}`} style={{ aspectRatio: width / height, maxHeight: 520 }}>
      {KOREA_REGIONS.map((r) => {
        const active = selected === r.code;
        const has = (counts[r.code] ?? 0) > 0;
        return (
          <Path
            key={r.code}
            d={r.d}
            fill={active ? c.accent : has ? c.accentSoft : c.line}
            stroke={c.bg}
            strokeWidth={1.2}
            onPress={() => onSelect(active ? undefined : r.code)}
          />
        );
      })}
      {pins.map((p) => {
        const { x, y } = project(p.lon, p.lat);
        return <Circle key={p.id} cx={x} cy={y} r={4} fill={c.text} stroke={c.bg} strokeWidth={1.5} />;
      })}
      {/* 광역시처럼 작은 지역은 지도 아래 칩으로 고릅니다 */}
      {KOREA_REGIONS.filter((r) => r.d && Number(r.code) >= 31).map((r) => {
        const n = counts[r.code] ?? 0;
        const active = selected === r.code;
        return (
          <G key={`l${r.code}`} onPress={() => onSelect(active ? undefined : r.code)}>
            <SvgText x={r.cx} y={r.cy} fontSize={11} fontFamily={family.bold} fill={active ? '#FFFFFF' : c.text} textAnchor="middle">
              {r.short}
            </SvgText>
            {n > 0 ? (
              <SvgText x={r.cx} y={r.cy + 13} fontSize={10} fontFamily={family.regular} fill={active ? '#FFFFFF' : c.accent} textAnchor="middle">
                {n}곳
              </SvgText>
            ) : null}
          </G>
        );
      })}
    </Svg>
  );
}
