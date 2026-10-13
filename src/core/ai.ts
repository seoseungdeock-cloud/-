// AI 연결 지점. 지금은 연결하지 않은 상태(Disconnected)로 동작하고,
// 승덕님이 요청하실 때 실제 모델(API)을 이 인터페이스에 붙입니다.

export type AiRequest = {
  task: 'room-reply' | 'meeting-summary' | 'opinion' | 'content' | 'program' | 'image-refresh';
  system: string;
  input: string;
};

export interface AiProvider {
  readonly connected: boolean;
  readonly name: string;
  complete(req: AiRequest): Promise<string>;
}

export class DisconnectedAi implements AiProvider {
  readonly connected = false;
  readonly name = 'AI 미연결';
  async complete(req: AiRequest): Promise<string> {
    return `[AI 미연결] '${req.task}' 요청을 받았습니다. AI가 연결되면 여기에 실제 답변이 표시됩니다.`;
  }
}

let provider: AiProvider = new DisconnectedAi();

export function getAi(): AiProvider {
  return provider;
}

export function setAi(next: AiProvider): void {
  provider = next;
}
