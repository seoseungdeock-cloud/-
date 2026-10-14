import { storageName } from '@/core/remote';
import { loginEmail, loginIdFromEmail, reasonOf, serverEnabled } from '@/core/supabase';

describe('supabase helpers', () => {
  it('stays on mock data without a server address', () => {
    expect(serverEnabled).toBe(false);
  });
  it('maps login ids to auth emails and back', () => {
    expect(loginEmail(' Lawyer ')).toBe('lawyer@rightnow.local');
    expect(loginIdFromEmail('lawyer@rightnow.local')).toBe('lawyer');
    expect(loginIdFromEmail('someone@gmail.com')).toBeUndefined();
  });
  it('turns server errors into readable reasons', () => {
    expect(reasonOf({ message: 'Invalid login credentials' })).toBe('아이디 또는 비밀번호가 맞지 않습니다.');
    expect(reasonOf({ message: '비밀번호가 맞지 않습니다.' })).toBe('비밀번호가 맞지 않습니다.');
    expect(reasonOf({ message: 'connection reset' })).toBe('잠시 후 다시 시도해 주세요.');
  });
  it('keeps storage paths ASCII (Korean file names stay only in the message)', () => {
    expect(storageName('f_1', '소장 최종.PDF')).toBe('f_1.pdf');
    expect(storageName('f_2', '사진')).toBe('f_2');
  });
});
