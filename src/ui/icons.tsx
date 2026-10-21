// 간단한 선 아이콘 (외부 아이콘 폰트 없이 SVG로 그립니다)
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type Props = { name: IconName; color: string; size?: number };
export type IconName = 'home' | 'search' | 'chat' | 'case' | 'map' | 'work' | 'me' | 'plus' | 'lock' | 'spark' | 'back' | 'send' | 'chevron' | 'board' | 'up' | 'down' | 'mail' | 'flag' | 'pin' | 'mute' | 'phone' | 'menu' | 'star' | 'check' | 'close' | 'reply' | 'copy' | 'notice' | 'forward' | 'trash' | 'hide' | 'exit' | 'people' | 'link' | 'file' | 'contact' | 'recall' | 'smile' | 'calendar' | 'image' | 'power';

export function Icon({ name, color, size = 24 }: Props) {
  const p = { stroke: color, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' && <Path {...p} d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />}
      {name === 'search' && (
        <>
          <Circle {...p} cx={11} cy={11} r={6.5} />
          <Path {...p} d="M16 16l4.5 4.5" />
        </>
      )}
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
      {name === 'image' && (
        <>
          <Rect {...p} x={3} y={4} width={18} height={16} rx={2} />
          <Circle {...p} cx={9} cy={10} r={1.8} />
          <Path {...p} d="M4 18l5-5 4 4 3-3 4 4" />
        </>
      )}
      {name === 'board' && <Path {...p} d="M5 4h14v16H5zM8 9h8M8 13h8M8 17h5" />}
      {name === 'up' && <Path {...p} d="M12 5l7 8h-4v6H9v-6H5z" />}
      {name === 'down' && <Path {...p} d="M12 19l7-8h-4V5H9v6H5z" />}
      {name === 'mail' && (
        <>
          <Rect {...p} x={3} y={5} width={18} height={14} rx={2} />
          <Path {...p} d="M3.5 6.5 12 13l8.5-6.5" />
        </>
      )}
      {name === 'flag' && <Path {...p} d="M5 21V4M5 4h11l-2 4 2 4H5" />}
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
      {name === 'pin' && <Path {...p} d="M9 3h6l-1 6 4 3v2H6v-2l4-3zM12 14v7" />}
      {name === 'mute' && <Path {...p} d="M4 9h4l5-4v14l-5-4H4zM17 9l4 6M21 9l-4 6" />}
      {name === 'phone' && <Path {...p} d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2z" />}
      {name === 'menu' && <Path {...p} d="M4 6h16M4 12h16M4 18h16" />}
      {name === 'star' && <Path {...p} d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />}
      {name === 'check' && <Path {...p} d="M5 12l5 5 9-10" />}
      {name === 'close' && <Path {...p} d="M6 6l12 12M18 6L6 18" />}
      {name === 'reply' && <Path {...p} d="M10 8V4l-7 7 7 7v-4c5 0 8 1 11 5-1-6-4-10-11-11z" />}
      {name === 'copy' && (
        <>
          <Rect {...p} x={8} y={8} width={12} height={12} rx={2} />
          <Path {...p} d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
        </>
      )}
      {name === 'notice' && <Path {...p} d="M3 10v4h3l7 5V5L6 10zM17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11" />}
      {name === 'forward' && <Path {...p} d="M14 8V4l7 7-7 7v-4c-5 0-8 1-11 5 1-6 4-10 11-11z" />}
      {name === 'trash' && <Path {...p} d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />}
      {name === 'hide' && <Path {...p} d="M3 3l18 18M10.6 6.1A9 9 0 0 1 21 12a14 14 0 0 1-2.4 3M6.6 6.6A14 14 0 0 0 3 12s3 6 9 6a9 9 0 0 0 4-1M9.9 9.9a3 3 0 0 0 4.2 4.2" />}
      {name === 'power' && <Path {...p} d="M12 3v8M7 6.3a7.5 7.5 0 1 0 10 0" />}
      {name === 'exit' && <Path {...p} d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />}
      {name === 'people' && (
        <>
          <Circle {...p} cx={9} cy={8} r={3.5} />
          <Path {...p} d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3.2 2.3 3.5 5" />
        </>
      )}
      {name === 'link' && <Path {...p} d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />}
      {name === 'file' && <Path {...p} d="M6 3h8l4 4v14H6zM14 3v4h4" />}
      {name === 'contact' && (
        <>
          <Rect {...p} x={4} y={3} width={16} height={18} rx={2} />
          <Circle {...p} cx={12} cy={10} r={3} />
          <Path {...p} d="M7.5 17c1-2 2.5-3 4.5-3s3.5 1 4.5 3" />
        </>
      )}
      {name === 'recall' && <Path {...p} d="M4 4v6h6M4.5 15a8 8 0 1 0 1.5-8.5L4 10" />}
      {name === 'calendar' && (
        <>
          <Rect {...p} x={3.5} y={5} width={17} height={15} rx={2} />
          <Path {...p} d="M3.5 10h17M8 3v4M16 3v4" />
        </>
      )}
      {name === 'smile' && (
        <>
          <Circle {...p} cx={12} cy={12} r={9} />
          <Path {...p} d="M8 14a5 5 0 0 0 8 0M9 9.5v.01M15 9.5v.01" />
        </>
      )}
    </Svg>
  );
}
