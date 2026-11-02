import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisEuro, tooltipEuro } from './format';

export type Row = Record<string, string | number | null>;
interface Series {
  key: string;
  color: string;
  stackId?: string;
}

const HEIGHT = 300;

function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="img" aria-label={label} className="chart-frame">
      <ResponsiveContainer width="100%" height={HEIGHT}>
        {children as never}
      </ResponsiveContainer>
    </div>
  );
}

const common = (rotate: boolean) => (
  <>
    <CartesianGrid strokeDasharray="3 3" stroke="#e2e5ec" />
    <XAxis dataKey="name" interval={0} tick={{ fontSize: 11 }} {...(rotate ? { angle: -30, textAnchor: 'end' as const, height: 70 } : {})} />
    <YAxis tickFormatter={axisEuro} tick={{ fontSize: 11 }} width={64} />
    <Tooltip formatter={tooltipEuro} />
    <Legend />
  </>
);

export function BarsChart({ data, series, label, rotate = false }: { data: Row[]; series: Series[]; label: string; rotate?: boolean }) {
  return (
    <Frame label={label}>
      <BarChart data={data}>
        {common(rotate)}
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} fill={s.color} isAnimationActive={false} {...(s.stackId ? { stackId: s.stackId } : {})} />
        ))}
      </BarChart>
    </Frame>
  );
}

export function LinesChart({ data, series, label }: { data: Row[]; series: Series[]; label: string }) {
  return (
    <Frame label={label}>
      <LineChart data={data}>
        {common(false)}
        {series.map((s) => (
          <Line key={s.key} isAnimationActive={false} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={{ r: 2 }} connectNulls />
        ))}
      </LineChart>
    </Frame>
  );
}
