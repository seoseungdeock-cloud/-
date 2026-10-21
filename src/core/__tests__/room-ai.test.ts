import { finishRoomAi, levelOf, ROOM_AI_REFUSAL, roomAiInput, roomAiSystem } from '../room-ai';

describe('대화방 @AI', () => {
  it('사건수행방은 AI가 참여하지 않는다', () => {
    expect(levelOf('private', 'case', true)).toBe('none');
    expect(levelOf('ai', 'case', true)).toBe('lawyer-assist');
    expect(levelOf('ai', 'group', false)).toBe('general-info');
    expect(levelOf('ai', 'office', false)).toBe('work');
  });

  it('범위 밖 질문은 정해진 문장으로 거절한다', () => {
    expect(finishRoomAi('__OFF_TOPIC__')).toEqual({ reply: ROOM_AI_REFUSAL, refused: true });
    expect(finishRoomAi('')).toEqual({ reply: ROOM_AI_REFUSAL, refused: true });
    expect(finishRoomAi(' 준비서면은 이렇게… ')).toEqual({ reply: '준비서면은 이렇게…', refused: false });
    expect(roomAiSystem('lawyer-assist')).toContain('__OFF_TOPIC__');
  });

  it('대화 기록에는 실명 대신 역할만 넣는다', () => {
    const input = roomAiInput(
      [
        { senderId: 'u1', senderKind: 'user', text: '홍길동입니다. 기일이 언제죠?' },
        { senderId: 'u2', senderKind: 'user', text: '다음 주입니다.' },
        { senderId: null, senderKind: 'ai', text: '참고하세요.' },
      ],
      { u1: 'client', u2: 'lawyer' },
      '@AI 준비서면 목차 잡아줘',
    );
    expect(input).toContain('의뢰인1: 홍길동입니다');
    expect(input).toContain('변호사1: 다음 주입니다.');
    expect(input).toContain('AI: 참고하세요.');
    expect(input).toContain('요청: 준비서면 목차 잡아줘');
    expect(input).not.toContain('u1');
  });
});

describe('나와의 메시지 @AI', () => {
  it('나만 있는 방은 AI를 부를 수 있다', () => {
    expect(levelOf('private', 'group', false, { firm: true })).toBe('lawyer-assist');
    expect(levelOf('private', 'group', false, { firm: false })).toBe('general-info');
    expect(levelOf('private', 'group', false)).toBe('none');
  });
});

describe('@AI 첨부 PDF', () => {
  it('문서 글을 요청 앞에 넣고, 길면 앞부분만, 비면 스캔본 안내', () => {
    const input = roomAiInput([], {}, '@AI 위 서면 요약', [
      { name: '가짜.pdf', text: '피고 주장의 요지' },
      { name: '긴.pdf', text: 'ㄱ'.repeat(40000) },
      { name: '스캔.pdf', text: '' },
    ]);
    expect(input).toContain('[첨부 문서: 가짜.pdf]\n피고 주장의 요지');
    expect(input).toContain('앞부분만 읽음');
    expect(input).toContain('스캔본일 수 있습니다');
    expect(input.indexOf('요청: 위 서면 요약')).toBeGreaterThan(input.indexOf('스캔.pdf'));
  });
});
