let seq = 0;
let uuidMode = false;

/** 서버가 붙으면 모든 id를 서버와 같은 형식(uuid)으로 만듭니다. 앱이 정한 id를 서버가 그대로 씁니다. */
export function useServerIds(on: boolean) {
  uuidMode = on;
}

function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function newId(prefix: string = 'id'): string {
  if (uuidMode) return uuid();
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
