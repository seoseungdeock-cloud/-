let seq = 0;

export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
