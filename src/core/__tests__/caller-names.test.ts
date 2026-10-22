import { callerEntries, parsePhoneList, phoneDigits } from '../caller-names';
import type { Room, User } from '../types';

const u = (id: string, role: User['role'], phone?: string) => ({ id, nickname: id.toUpperCase(), role, phone }) as User;
const room = (id: string, kind: Room['kind'], memberIds: string[], title = id) => ({ id, kind, memberIds, title }) as Room;

describe('전화 올 때 의뢰인 이름', () => {
  const users = [u('me', 'lawyer'), u('c1', 'client', '010-1111-2222'), u('c2', 'client', '+82 10-3333-4444'), u('c3', 'client', '02-123-4567'), u('cl', 'client')];
  const rooms = [room('a', 'case', ['me', 'c1', 'c2'], '임대차'), room('b', 'case', ['me', 'c1'], '사기'), room('x', 'group', ['me', 'c3']), room('y', 'case', ['c1', 'c3'])];

  it('내 사건방 의뢰인의 휴대폰만, 여러 사건이면 외 N건', () => {
    expect(callerEntries(rooms, users, 'me')).toEqual([
      { phone: '010-1111-2222', digits: '01011112222', name: '의뢰인 C1 · 임대차 외 1건' },
      { phone: '+82 10-3333-4444', digits: '01033334444', name: '의뢰인 C2 · 임대차' },
    ]);
    expect(callerEntries(rooms, users, 'c1')).toEqual([]);
    expect(phoneDigits('+82 10-3333-4444')).toBe('01033334444');
  });

  it('붙여넣기 목록을 읽음', () => {
    expect(parsePhoneList('홍길동 010 1234 5678\n김영희,01098765432\n이상한 줄\n\n박 02-123-4567')).toEqual({
      items: [{ name: '홍길동', phone: '010-1234-5678' }, { name: '김영희', phone: '010-9876-5432' }],
      bad: ['이상한 줄', '박 02-123-4567'],
    });
  });
});
