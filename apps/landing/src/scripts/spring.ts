const canLinear = CSS.supports("animation-timing-function", "linear(0, 1)");

export interface Spring {
  /** Step response at time `t` in seconds. */
  x: (t: number) => number;
  /** Seconds until the envelope drops under 0.3%. */
  settle: number;
}

export function springFn(freq: number, damping: number): Spring {
  const w = 2 * Math.PI * freq;
  const wd = w * Math.sqrt(1 - damping * damping);
  return {
    x: (t) => 1 - Math.exp(-damping * w * t) * (Math.cos(wd * t) + ((damping * w) / wd) * Math.sin(wd * t)),
    settle: Math.log(333) / (damping * w),
  };
}

/** The same spring sampled into a CSS `linear()` easing for the Web Animations API. */
export function spring(freq: number, damping: number): { duration: number; easing: string } {
  const { x, settle } = springFn(freq, damping);
  const duration = settle * 1000;
  if (!canLinear) return { duration, easing: "cubic-bezier(0.34, 1.45, 0.64, 1)" };
  const n = 48;
  const pts = Array.from({ length: n + 1 }, (_, i) => +x((i / n) * settle).toFixed(4));
  pts[n] = 1;
  return { duration, easing: `linear(${pts.join(",")})` };
}
