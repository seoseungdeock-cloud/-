// 경영 에이전트 ③ 예전 이미지를 최신 데이터로 다시 만들기
// 이미지를 그림 파일이 아니라 "데이터 + 템플릿"으로 저장해 두면 언제든 같은 모양으로 다시 그릴 수 있습니다.

export type DataRow = { label: string; value: number };

export type ImageTemplate = {
  id: string;
  name: string;
  chart: 'bar' | 'line';
  unit: string;
  versions: { at: string; rows: DataRow[] }[]; // 최신이 마지막
};

export function latest(t: ImageTemplate) {
  return t.versions[t.versions.length - 1];
}

export function refreshTemplate(t: ImageTemplate, rows: DataRow[], at: string): ImageTemplate {
  return { ...t, versions: [...t.versions, { at, rows }] };
}

/** "라벨 값" 줄 단위 텍스트를 데이터로 바꿉니다. 예: "1월 120" */
export function parseRows(text: string): DataRow[] {
  return text
    .split(/\n+/)
    .map((l) => l.trim().match(/^(.+?)[\s,:]+(-?[\d,.]+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ label: m[1].trim(), value: Number(m[2].replace(/,/g, '')) }));
}

/** 차트 좌표 계산 (화면 그리기와 분리해 테스트 가능하게 둡니다) */
export function layoutChart(rows: DataRow[], width: number, height: number, pad = 28) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const step = rows.length ? innerW / rows.length : 0;
  return rows.map((r, i) => {
    const h = (Math.max(0, r.value) / max) * innerH;
    return {
      ...r,
      x: pad + step * i + step * 0.15,
      w: step * 0.7,
      cx: pad + step * i + step / 2,
      y: pad + innerH - h,
      h,
    };
  });
}
