import { el } from "./dom";
import { CX, CY } from "./effects";
import { springFn } from "./spring";

const COLORS = ["#E8462A", "#EC5A2A", "#F06E2A", "#F4822B", "#F8962B", "#FBA82C", "#FFB300"];
const MARK_W = 61.1;
const MARK_H = 67.4;

interface Particle {
  tx: number;
  ty: number;
  ox: number;
  oy: number;
  delay: number;
  size: number;
  tone: number;
}

/**
 * Pixel scatter to logo. The outline of the mark is sampled into particles that spiral in from all
 * around the viewport and spring into place, clockwise from the top. Resolves with the canvas once
 * every particle has settled.
 */
export async function assemble(): Promise<HTMLCanvasElement> {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const cvs = document.createElement("canvas");
  cvs.className = "dust";
  cvs.width = Math.round(innerWidth * dpr);
  cvs.height = Math.round(innerHeight * dpr);
  document.body.insertBefore(cvs, el.stage);
  const ctx = cvs.getContext("2d");
  const outline = el.body.querySelector(":scope > path")?.getAttribute("d");
  const m = el.body.getScreenCTM();
  if (!ctx || !outline || !m) return cvs;
  ctx.scale(dpr, dpr);

  const path = new Path2D(outline);
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return cvs;

  const scale = Math.hypot(m.a, m.b);
  const step = Math.max(0.9, 3 / scale);
  const size = step * scale * 0.7;
  const reach = Math.max(innerWidth, innerHeight) * 0.6;
  const { x: spr, settle } = springFn(2.1, 0.68);

  const particles: Particle[] = [];
  for (let gx = 0; gx <= MARK_W; gx += step) {
    for (let gy = 0; gy <= MARK_H; gy += step) {
      const ux = gx + (Math.random() - 0.5) * step * 0.7;
      const uy = gy + (Math.random() - 0.5) * step * 0.7;
      if (!probe.isPointInPath(path, ux, uy, "evenodd")) continue;
      const turn = ((Math.atan2(ux - CX, -(uy - CY)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
      const psi = Math.random() * Math.PI * 2;
      const rad = reach * (0.3 + Math.random() * 0.7);
      const tone = Math.round(((ux / MARK_W + (1 - uy / MARK_H)) / 2) * (COLORS.length - 1));
      particles.push({
        tx: m.a * ux + m.c * uy + m.e,
        ty: m.b * ux + m.d * uy + m.f,
        ox: Math.cos(psi) * rad,
        oy: Math.sin(psi) * rad,
        delay: 60 + turn * 460 + Math.random() * 150,
        size: size * (0.8 + Math.random() * 0.4),
        tone: Math.max(0, Math.min(COLORS.length - 1, tone)),
      });
    }
  }
  particles.sort((a, b) => a.tone - b.tone);

  const total = Math.max(...particles.map((p) => p.delay)) + settle * 1000;
  const swirl = 1.5;
  const t0 = performance.now();

  await new Promise<void>((resolve) => {
    const draw = (now: number) => {
      const elapsed = now - t0;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      let tone = -1;
      for (const p of particles) {
        const t = (elapsed - p.delay) / 1000;
        if (t <= 0) continue;
        const k = spr(Math.min(t, settle));
        const f = 1 - k;
        const a = swirl * f;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        if (p.tone !== tone) {
          tone = p.tone;
          ctx.fillStyle = COLORS[tone];
        }
        ctx.globalAlpha = Math.min(1, t / 0.14);
        ctx.fillRect(p.tx + (p.ox * ca - p.oy * sa) * f - p.size / 2, p.ty + (p.ox * sa + p.oy * ca) * f - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      if (elapsed >= total) return resolve();
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });
  return cvs;
}
