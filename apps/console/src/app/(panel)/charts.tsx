/** Small server-rendered SVG line chart (no chart library). */
export type Series = { name: string; color: string; values: number[] };

function niceMax(v: number) {
  if (v <= 4) return 4;
  const raw = v / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? 10 * mag;
  return step * 4;
}

export function LineChart({ labels, series, height = 320 }: { labels: string[]; series: Series[]; height?: number }) {
  const W = 760;
  const H = height;
  const pad = { l: 40, r: 34, t: 16, b: 36 };
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);
  const x = (i: number) => pad.l + (labels.length <= 1 ? 0 : (i * (W - pad.l - pad.r)) / (labels.length - 1));
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const every = Math.max(1, Math.ceil(labels.length / 8));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={series.map((s) => s.name).join(" and ") + " per day"}>
      <defs>
        {series.map((s, k) => (
          <linearGradient key={k} id={`fill-${k}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#ece8e1" strokeDasharray={t === 0 ? undefined : "3 4"} />
          <text x={pad.l - 10} y={y(t) + 4} textAnchor="end" fontSize="13" fontWeight="600" fill="#6b787e">{Math.round(t)}</text>
        </g>
      ))}
      {labels.map((l, i) => (i % every === 0 || i === labels.length - 1) && (
        <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fontSize="13" fontWeight="600" fill="#6b787e">{l}</text>
      ))}
      {series.map((s, k) => {
        const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
        const area = `M${x(0)},${y(0)} L${s.values.map((v, i) => `${x(i)},${y(v)}`).join(" L")} L${x(s.values.length - 1)},${y(0)} Z`;
        return (
          <g key={s.name}>
            <path d={area} fill={`url(#fill-${k})`} />
            <polyline points={pts} fill="none" stroke={s.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r="5" fill="#fff" stroke={s.color} strokeWidth="2.5">
                <title>{`${s.name}, ${labels[i]}: ${v}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
