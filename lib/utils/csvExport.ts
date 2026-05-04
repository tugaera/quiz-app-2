export function buildResultsCsv(params: {
  nicknames: string[];
  totalPoints: number[];
  pointsByQuestion: number[][];
}): string {
  const { nicknames, totalPoints, pointsByQuestion } = params;
  const qCount = pointsByQuestion[0]?.length ?? 0;
  const headers = [
    "nickname",
    "total_points",
    ...Array.from({ length: qCount }, (_, i) => `points_q${i + 1}`),
  ];
  const rows = nicknames.map((nickname, i) => {
    const pts = pointsByQuestion[i] ?? [];
    return [nickname, String(totalPoints[i] ?? 0), ...pts.map(String)];
  });
  const escape = (v: string) => {
    if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  return [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
}
