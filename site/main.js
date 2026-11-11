const $ = (id) => document.getElementById(id);
const css = getComputedStyle(document.documentElement);
const EASE_OUT = css.getPropertyValue("--ease-out").trim();
const EASE_PANEL = css.getPropertyValue("--ease-panel").trim();
const EASE_IN_OUT = css.getPropertyValue("--ease-in-out").trim();
const EASE_CHARGE = "cubic-bezier(0.65, 0, 0.35, 1)";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
const canLinear = CSS.supports("animation-timing-function", "linear(0, 1)");

const el = {
  glow: document.querySelector(".glow"),
  stage: $("stage"), bot: $("bot"), body: $("body"), gaze: $("gaze"),
  eyeL: $("eyeL"), eyeR: $("eyeR"), burst: $("burst"), sparks: $("sparks"),
  words: [...document.querySelectorAll(".title .w")],
  sub: $("sub"), foot: $("foot"),
};
const eyes = [el.eyeL, el.eyeR];
const CX = 30.55, CY = 33.7;

// Damped spring step response. `settle` is when its envelope drops under 0.3%.
function springFn(freq, damping) {
  const w = 2 * Math.PI * freq;
  const wd = w * Math.sqrt(1 - damping * damping);
  return {
    x: (t) => 1 - Math.exp(-damping * w * t) * (Math.cos(wd * t) + ((damping * w) / wd) * Math.sin(wd * t)),
    settle: Math.log(333) / (damping * w),
  };
}

// The same spring sampled into a CSS linear() easing for WAAPI.
function spring(freq, damping) {
  const { x, settle: duration } = springFn(freq, damping);
  if (!canLinear) return { duration, easing: "cubic-bezier(0.34, 1.45, 0.64, 1)" };
  const n = 48;
  const pts = Array.from({ length: n + 1 }, (_, i) => +x((i / n) * duration).toFixed(4));
  pts[n] = 1;
  return { duration, easing: `linear(${pts.join(",")})` };
}

const play = (target, keyframes, opts) => target.animate(keyframes, { fill: "both", ...opts });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const frame = () => new Promise((r) => requestAnimationFrame(r));
const ms = (s) => s * 1000;
const SQUINT = "scale(1.12, 0.38) translateY(1.4px)";

const squint = (duration = 900) => eyes.forEach((e) => play(e, [
  { transform: "scale(1)" }, { transform: SQUINT, offset: 0.22 }, { transform: SQUINT, offset: 0.64 }, { transform: "scale(1)" },
], { duration, easing: EASE_OUT, fill: "none" }));

function blink() {
  return Promise.all(eyes.map((e) => play(e, [
    { transform: "scaleY(1)" }, { transform: "scaleY(0.08)", offset: 1 / 3, easing: EASE_OUT }, { transform: "scaleY(1)" },
  ], { duration: 240, easing: EASE_IN_OUT, fill: "none" }).finished));
}

function sparkBurst(radius = 38) {
  const NS = "http://www.w3.org/2000/svg";
  const colors = ["#e8462a", "#ff9a3d", "#ffb300", "#ffd54f"];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.22;
    const reach = 18 + (i % 3) * 7;
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("class", "spark");
    c.setAttribute("r", i % 3 === 0 ? 1.7 : 1.1);
    c.setAttribute("cx", CX + Math.cos(a) * radius);
    c.setAttribute("cy", CY + Math.sin(a) * radius);
    c.setAttribute("fill", colors[i % colors.length]);
    el.sparks.append(c);
    const dx = Math.cos(a) * reach, dy = Math.sin(a) * reach;
    play(c, [
      { transform: "translate(0,0) scale(0.2)", opacity: 0 },
      { transform: `translate(${dx * 0.55}px,${dy * 0.55}px) scale(1)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${dx}px,${dy}px) scale(0.4)`, opacity: 0 },
    ], { duration: 760, delay: i * 12, easing: EASE_OUT }).finished.then(() => c.remove(), () => c.remove());
  }
}

// Pixel scatter to logo: the outline of the mark is sampled into particles that spiral in from
// all around the viewport and spring into place, clockwise from the top.
async function assemble() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const cvs = document.createElement("canvas");
  cvs.className = "dust";
  cvs.width = Math.round(innerWidth * dpr);
  cvs.height = Math.round(innerHeight * dpr);
  document.body.insertBefore(cvs, el.stage);
  const ctx = cvs.getContext("2d");
  ctx.scale(dpr, dpr);

  const path = new Path2D(el.body.querySelector(":scope > path").getAttribute("d"));
  const probe = document.createElement("canvas").getContext("2d");
  const m = el.body.getScreenCTM();
  const scale = Math.hypot(m.a, m.b);
  const step = Math.max(0.9, 3 / scale);
  const size = step * scale * 0.7;
  const COLORS = ["#E8462A", "#EC5A2A", "#F06E2A", "#F4822B", "#F8962B", "#FBA82C", "#FFB300"];
  const mid = { x: m.a * CX + m.c * CY + m.e, y: m.b * CX + m.d * CY + m.f };
  const reach = Math.max(innerWidth, innerHeight) * 0.6;
  const { x: spr, settle } = springFn(2.1, 0.68);

  const ps = [];
  for (let gx = 0; gx <= 61.1; gx += step) {
    for (let gy = 0; gy <= 67.4; gy += step) {
      const ux = gx + (Math.random() - 0.5) * step * 0.7;
      const uy = gy + (Math.random() - 0.5) * step * 0.7;
      if (!probe.isPointInPath(path, ux, uy, "evenodd")) continue;
      const tx = m.a * ux + m.c * uy + m.e, ty = m.b * ux + m.d * uy + m.f;
      const turn = ((Math.atan2(ux - CX, -(uy - CY)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
      const psi = Math.random() * Math.PI * 2, rad = reach * (0.3 + Math.random() * 0.7);
      const tone = Math.round(((ux / 61.1 + (1 - uy / 67.4)) / 2) * (COLORS.length - 1));
      ps.push({ tx, ty, ox: Math.cos(psi) * rad, oy: Math.sin(psi) * rad, delay: 60 + turn * 460 + Math.random() * 150, s: size * (0.8 + Math.random() * 0.4), tone: Math.max(0, Math.min(COLORS.length - 1, tone)) });
    }
  }
  ps.sort((a, b) => a.tone - b.tone);
  const total = Math.max(...ps.map((p) => p.delay)) + ms(settle);
  const swirl = 1.5;
  const t0 = performance.now();

  await new Promise((resolve) => {
    const draw = (now) => {
      const el_ = now - t0;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      let tone = -1;
      for (const p of ps) {
        const t = (el_ - p.delay) / 1000;
        if (t <= 0) continue;
        const k = spr(Math.min(t, settle));
        const f = 1 - k, a = swirl * f, ca = Math.cos(a), sa = Math.sin(a);
        const x = p.tx + (p.ox * ca - p.oy * sa) * f;
        const y = p.ty + (p.ox * sa + p.oy * ca) * f;
        if (p.tone !== tone) { tone = p.tone; ctx.fillStyle = COLORS[tone]; }
        ctx.globalAlpha = Math.min(1, t / 0.14);
        ctx.fillRect(x - p.s / 2, y - p.s / 2, p.s, p.s);
      }
      ctx.globalAlpha = 1;
      if (el_ >= total) return resolve();
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });
  return cvs;
}

async function intro() {
  const sBody = spring(2.4, 0.72);
  const sEye = spring(3, 0.62);

  // The mark starts large and centered, then lifts into the stack above the title.
  const stage = el.stage.getBoundingClientRect();
  const bot = el.bot.getBoundingClientRect();
  const dy = stage.top + stage.height / 2 - (bot.top + bot.height / 2);
  const liftFrom = `translateY(${dy}px) scale(1.18)`;
  const hold = play(el.bot, [{ transform: liftFrom }, { transform: liftFrom }], { duration: 1 });
  play(el.glow, [{ opacity: 0 }, { opacity: 1 }], { duration: 1600, easing: EASE_PANEL });
  await frame();

  // 1. Assemble. Particles spiral in and lock to the outline of the mark.
  const dust = await assemble();

  // 2. Power on. The vector takes over, burst and sparks, the eyes wake up.
  play(el.body, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE_OUT });
  dust.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: EASE_OUT, fill: "forwards" }).finished.then(() => dust.remove());
  play(el.burst, [{ opacity: 0.7, transform: "scale(0.72)" }, { opacity: 0, transform: "scale(1.45)" }], { duration: 800, easing: EASE_OUT });
  sparkBurst();
  play(el.body, [{ transform: "scale(0.93)" }, { transform: "scale(1)" }], { duration: ms(sBody.duration), easing: sBody.easing, composite: "replace" });

  eyes.forEach((e, i) => play(e, [
    { transform: "scaleY(0.08)" },
    { transform: "scaleY(0.55)", offset: 0.2 },
    { transform: "scaleY(0.08)", offset: 0.34 },
    { transform: "scaleY(1)" },
  ], { duration: 520 + ms(sEye.duration) * 0.4, delay: 160 + i * 40, easing: EASE_OUT }));

  // 3. Lift into place while the title rises. The eyes glance down at it.
  hold.cancel();
  play(el.bot, [{ transform: liftFrom }, { transform: "translateY(0) scale(1)" }], { duration: 820, delay: 240, easing: EASE_PANEL });
  const scan = play(el.gaze, [
    { transform: "translate(0, 0)" },
    { transform: "translate(0, 3.4px)", offset: 0.22 },
    { transform: "translate(0, 3.4px)", offset: 0.78 },
    { transform: "translate(0, 0)" },
  ], { duration: 2100, delay: 700, easing: EASE_IN_OUT });

  el.words.forEach((w, i) => play(w, [{ transform: "translateY(108%)" }, { transform: "translateY(0)" }], { duration: 820, delay: 420 + i * 120, easing: EASE_OUT }));
  el.words.forEach((w, i) => play(w, [{ backgroundPosition: "110% 0, 0 0" }, { backgroundPosition: "0% 0, 0 0" }], { duration: 900, delay: 1250 + i * 170, easing: EASE_IN_OUT }));
  play(el.sub, [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 620, delay: 900, easing: EASE_OUT });
  play(el.foot, [{ opacity: 0 }, { opacity: 1 }], { duration: 800, delay: 1400, easing: EASE_OUT });

  await sleep(2600);
  squint();
  await sleep(300);
  scan.cancel();
  await sleep(700);
  document.documentElement.classList.add("ready");
  el.bot.getAnimations().forEach((a) => a.cancel());
  el.bot.classList.add("alive");
  startIdle();
}

function startIdle() {
  const sTap = spring(3, 0.55);

  (async function blinkLoop() {
    for (;;) {
      await sleep(2400 + Math.random() * 3200);
      if (document.hidden) continue;
      await blink();
      if (Math.random() < 0.22) { await sleep(110); await blink(); }
    }
  })();

  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, settle = 0;
  const MAX_X = 6.5, MAX_Y = 3.4;
  const tick = () => {
    cx += (tx - cx) * 0.14; cy += (ty - cy) * 0.14;
    el.gaze.style.transform = `translate(${cx.toFixed(2)}px, ${cy.toFixed(2)}px)`;
    raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.02 ? requestAnimationFrame(tick) : 0;
  };
  const lookAt = (clientX, clientY) => {
    const r = el.bot.getBoundingClientRect();
    const nx = (clientX - (r.left + r.width / 2)) / (innerWidth / 2);
    const ny = (clientY - (r.top + r.height / 2)) / (innerHeight / 2);
    tx = Math.max(-1, Math.min(1, nx)) * MAX_X;
    ty = Math.max(-1, Math.min(1, ny)) * MAX_Y;
    if (!raf) raf = requestAnimationFrame(tick);
  };
  const lookAway = () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick); };

  if (finePointer) {
    addEventListener("pointermove", (e) => lookAt(e.clientX, e.clientY), { passive: true });
    document.documentElement.addEventListener("pointerleave", lookAway);
  }

  // Press feedback lands on pointerdown so touch feels instant. The eyes glance at the finger.
  el.bot.addEventListener("pointerdown", (e) => {
    clearTimeout(settle);
    play(el.body, [{ transform: "scale(0.94)" }], { duration: 120, easing: EASE_OUT, composite: "replace" });
    lookAt(e.clientX, e.clientY);
  });
  const release = (celebrate) => {
    el.body.getAnimations().forEach((a) => a.cancel());
    if (celebrate) {
      play(el.body, [{ transform: "scale(0.94)" }, { transform: "scale(1)" }], { duration: ms(sTap.duration), easing: sTap.easing, fill: "none" });
      sparkBurst(36);
      squint(800);
    }
    if (!finePointer) settle = setTimeout(lookAway, 900);
  };
  el.bot.addEventListener("pointerup", () => release(true));
  el.bot.addEventListener("pointercancel", () => release(false));
}

if (!reduced) intro();
