const RATE = 0.998;

export const project = (v, rate = RATE) => (v / 1000) * rate / (1 - rate);

export const rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

export function resist(value, min, max, dim) {
  if (value < min) return min - rubberband(min - value, dim);
  if (value > max) return max + rubberband(value - max, dim);
  return value;
}

export function releaseVelocity(history, now, windowMs = 100) {
  const recent = history.filter(p => now - p.t <= windowMs);
  if (recent.length < 2) return { x: 0, y: 0 };
  const a = recent[0], b = recent[recent.length - 1], dt = (b.t - a.t) / 1000;
  return dt > 0 ? { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt } : { x: 0, y: 0 };
}

export const decayed = (v, dtMs, rate = RATE) => v * rate ** dtMs;
