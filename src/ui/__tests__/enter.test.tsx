import { Platform } from 'react-native';

import { enterToSend } from '../kit';

const press = (onKeyPress: ((e: never) => void) | undefined, n: Record<string, unknown>) => {
  const e = { nativeEvent: { key: 'Enter', ...n }, preventDefault: jest.fn() };
  onKeyPress?.(e as never);
  return e.preventDefault.mock.calls.length > 0;
};

describe('enterToSend', () => {
  const os = Platform.OS;
  afterEach(() => { Platform.OS = os; });

  it('PC(웹): 엔터 보내기, Shift+엔터·한글 조합 중 엔터는 그대로', () => {
    Platform.OS = 'web';
    const send = jest.fn();
    const { onKeyPress } = enterToSend(send);
    expect(press(onKeyPress, {})).toBe(true);
    expect(press(onKeyPress, { shiftKey: true })).toBe(false);
    expect(press(onKeyPress, { isComposing: true })).toBe(false);
    expect(press(onKeyPress, { keyCode: 229 })).toBe(false);
    expect(press(onKeyPress, { key: 'a' })).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('폰: 엔터는 줄바꿈 그대로', () => {
    Platform.OS = 'ios';
    expect(enterToSend(jest.fn()).onKeyPress).toBeUndefined();
  });
});
