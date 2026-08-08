/**
 * Shared chart tokens. The categorical order is fixed — a slice keeps its hue no
 * matter how many other slices are present — and was validated for colour-blind
 * separation against a white surface before being written down here.
 */
export const CATEGORICAL = ['#2563eb', '#f59e0b', '#16a34a', '#db2777', '#06b6d4'];

/** Everything past the 5th category folds into one neutral "Other" slice. */
export const OTHER_COLOR = '#94a3b8';

export const ACCENT = '#2563eb';
export const POSITIVE = '#16a34a';
export const NEGATIVE = '#dc2626';

export const AXIS_INK = '#94a3b8';
export const GRID_INK = '#e2e8f0';

const compactFormatter = new Intl.NumberFormat('en-IN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const compactNumber = (value) => compactFormatter.format(Number(value) || 0);
export const compactMoney = (value) => `₹${compactFormatter.format(Number(value) || 0)}`;

/** Axis/grid styling applied to every chart so they read as one system. */
export const chartAxisSx = {
  '& .MuiChartsAxis-line, & .MuiChartsAxis-tick': { stroke: GRID_INK },
  '& .MuiChartsAxis-tickLabel': { fill: AXIS_INK, fontSize: 11 },
  '& .MuiChartsGrid-line': { stroke: GRID_INK, strokeDasharray: '3 3' },
};
