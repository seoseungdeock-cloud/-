// 간단한 선 아이콘 (외부 아이콘 폰트 없이 SVG로 그립니다)
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type Props = { name: IconName; color: string; size?: number };
export type IconName = 'chat' | 'case' | 'map' | 'work' | 'me' | 'plus' | 'lock' | 'spark' | 'back' | 'send' | 'chevron';

export function Icon({ name, color, size = 24 }: Props) {
  const p = { stroke: color, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'chat' && <Path {...p} d="M4 5h16v11H9l-5 4z" />}
      {name === 'case' && (
        <>
          <Rect {...p} x={3} y={7} width={18} height={13} rx={2} />
          <Path {...p} d="M9 7V5h6v2M3 12h18" />
        </>
      )}
      {name === 'map' && <Path {...p} d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14" />}
      {name === 'work' && <Path {...p} d="M12 3l2.2 5.3L20 9l-4.4 3.8L17 19l-5-3-5 3 1.4-6.2L4 9l5.8-.7z" />}
      {name === 'me' && (
        <>
          <Circle {...p} cx={12} cy={8} r={4} />
          <Path {...p} d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </>
      )}
      {name === 'plus' && <Path {...p} d="M12 5v14M5 12h14" />}
      {name === 'lock' && (
        <>
          <Rect {...p} x={5} y={11} width={14} height={9} rx={2} />
          <Path {...p} d="M8 11V8a4 4 0 0 1 8 0v3" />
        </>
      )}
      {name === 'spark' && <Path {...p} d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />}
      {name === 'back' && <Path {...p} d="M15 5l-7 7 7 7" />}
      {name === 'send' && <Path {...p} d="M4 12l16-8-6 16-2-6z" />}
      {name === 'chevron' && <Path {...p} d="M9 5l7 7-7 7" />}
    </Svg>
  );
}
