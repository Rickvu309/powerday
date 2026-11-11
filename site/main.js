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

// Silk-flow background. Domain-warped noise bands in cream, amber and coral, kept light behind the
// content. `reveal` sends a shockwave out from the mark that paints the field in.
const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes, uMouse, uCenter;
uniform float uTime, uAppear;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(asp, 1.0);
  vec2 m = (uMouse - 0.5) * vec2(asp, 1.0);
  vec2 dm = p - m; float md = length(dm);
  p += dm / (md + 0.15) * 0.05 * exp(-md * 2.5);

  float t = uTime * 0.06;
  vec2 q = vec2(fbm(p * 1.1 + vec2(0.0, t)), fbm(p * 1.1 + vec2(5.2, 1.3) - t));
  float r = fbm(p * 1.3 + 2.2 * q + vec2(1.7, 9.2) + t * 0.7);

  float band = 0.5 + 0.5 * sin((p.x * 0.9 + p.y * 1.4) * 2.6 + r * 5.5 + t * 1.5);
  float silk = pow(band, 1.8);
  float cl = r * 16.0;
  float line = 1.0 - smoothstep(0.0, 1.5 * fwidth(cl) + 0.01, 0.5 - abs(fract(cl) - 0.5));

  vec2 c = (uv - 0.5) * vec2(1.0, 1.15);
  float e = smoothstep(0.12, 0.85, length(c) * 1.25);
  float strength = mix(0.1, 1.0, e);

  vec3 cream = vec3(1.0, 0.984, 0.953);
  vec3 amber = vec3(1.0, 0.72, 0.10);
  vec3 orange = vec3(1.0, 0.55, 0.20);
  vec3 coral = vec3(0.93, 0.30, 0.17);
  vec3 tone = mix(amber, orange, smoothstep(0.3, 0.8, r));
  tone = mix(tone, coral, smoothstep(0.65, 1.0, silk) * 0.55 * e);

  vec3 col = mix(cream, tone, silk * strength * 0.85);
  col += vec3(1.0, 0.98, 0.9) * pow(band, 8.0) * 0.12 * strength;
  col = mix(col, vec3(0.9, 0.45, 0.1), line * 0.10 * (0.35 + e));
  col += vec3(1.0, 0.8, 0.4) * exp(-md * 3.5) * 0.08;

  float d = length((uv - uCenter) * vec2(asp, 1.0));
  float front = uAppear * 1.9;
  float rev = 1.0 - smoothstep(front - 0.35, front, d);
  float ring = exp(-pow((d - front + 0.18) / 0.07, 2.0)) * step(0.001, uAppear) * (1.0 - uAppear * 0.6);
  col = mix(cream, col, rev);
  col = mix(col, amber, ring * 0.35);

  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.018;
  o = vec4(col, 1.0);
}`;

function initShader() {
  const cvs = $("gl");
  const gl = cvs.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "low-power" });
  const fail = () => { document.documentElement.classList.add("no-gl"); cvs.remove(); return null; };
  if (!gl) return fail();
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return fail();
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return fail();
  gl.useProgram(prog);
  const u = Object.fromEntries(["uRes", "uMouse", "uCenter", "uTime", "uAppear"].map((n) => [n, gl.getUniformLocation(prog, n)]));

  const quality = (finePointer ? 0.7 : 0.55) * Math.min(devicePixelRatio || 1, 1.5);
  const resize = () => {
    cvs.width = Math.max(2, Math.round(innerWidth * quality));
    cvs.height = Math.max(2, Math.round(innerHeight * quality));
    gl.viewport(0, 0, cvs.width, cvs.height);
    gl.uniform2f(u.uRes, cvs.width, cvs.height);
  };
  resize();
  addEventListener("resize", resize);

  let appear = 0, from = 0, dur = 0, mx = 0.5, my = 0.5, tmx = 0.5, tmy = 0.5, frameNo = 0;
  gl.uniform2f(u.uCenter, 0.5, 0.5);
  addEventListener("pointermove", (e) => { tmx = e.clientX / innerWidth; tmy = 1 - e.clientY / innerHeight; }, { passive: true });

  const draw = (now) => {
    if (!reduced) requestAnimationFrame(draw);
    if (!appear && !from) return;
    if (!finePointer && (frameNo++ & 1)) return;
    if (from) {
      const k = Math.min(1, (now - from) / dur);
      appear = 1 - Math.pow(1 - k, 3);
      if (k >= 1) from = 0;
    }
    mx += (tmx - mx) * 0.06; my += (tmy - my) * 0.06;
    gl.uniform1f(u.uTime, reduced ? 12 : now / 1000);
    gl.uniform1f(u.uAppear, appear);
    gl.uniform2f(u.uMouse, mx, my);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  requestAnimationFrame(draw);

  return {
    reveal(duration) {
      const r = el.body.getBoundingClientRect();
      gl.uniform2f(u.uCenter, (r.left + r.width / 2) / innerWidth, 1 - (r.top + r.height / 2) / innerHeight);
      if (reduced) { appear = 1; draw(performance.now()); return; }
      from = performance.now(); dur = duration;
    },
  };
}

const shader = initShader();

async function intro() {
  const sBody = spring(2.4, 0.72);
  const sEye = spring(3, 0.62);

  // The mark starts large and centered, then lifts into the stack above the title.
  const stage = el.stage.getBoundingClientRect();
  const bot = el.bot.getBoundingClientRect();
  const dy = stage.top + stage.height / 2 - (bot.top + bot.height / 2);
  const liftFrom = `translateY(${dy}px) scale(1.18)`;
  const hold = play(el.bot, [{ transform: liftFrom }, { transform: liftFrom }], { duration: 1 });
  await frame();

  // 1. Assemble. Particles spiral in and lock to the outline of the mark.
  const dust = await assemble();

  // 2. Power on. The vector takes over, a shockwave paints the shader, the eyes wake up.
  shader?.reveal(2600);
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

if (reduced) shader?.reveal(0);
else intro();
