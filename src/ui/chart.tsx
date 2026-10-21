import Svg, { Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { layoutChart, type DataRow } from '@/core/templates';
import { SVG_FONT, useColors } from './theme';

export function Chart({ rows, chart, unit }: { rows: DataRow[]; chart: 'bar' | 'line'; unit: string }) {
  const c = useColors();
  const W = 340, H = 200;
  const pts = layoutChart(rows, W, H);
  return (
    <Svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ aspectRatio: W / H }}>
      <Line x1={28} y1={H - 28} x2={W - 28} y2={H - 28} stroke={c.line} />
      {chart === 'bar'
        ? pts.map((p) => <Rect key={p.label} x={p.x} y={p.y} width={p.w} height={p.h} rx={4} fill={c.accent} />)
        : <Polyline points={pts.map((p) => `${p.cx},${p.y}`).join(' ')} fill="none" stroke={c.accent} strokeWidth={2.5} />}
      {pts.map((p) => (
        <SvgText key={`v${p.label}`} x={p.cx} y={p.y - 6} fontSize={11} fontFamily={SVG_FONT} fill={c.text} textAnchor="middle">{`${p.value}${unit}`}</SvgText>
      ))}
      {pts.map((p) => (
        <SvgText key={`l${p.label}`} x={p.cx} y={H - 12} fontSize={11} fontFamily={SVG_FONT} fill={c.sub} textAnchor="middle">{p.label}</SvgText>
      ))}
    </Svg>
  );
}
