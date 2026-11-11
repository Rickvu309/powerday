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
  eyeL: $("eyeL"), eyeR: $("eyeR"),
  ring: $("ring"), track: document.querySelector(".ring-track"), burst: $("burst"),
  lead: $("lead"), sweep: $("sweep"), sparks: $("sparks"),
  words: [...document.querySelectorAll(".title .w")],
  sub: $("sub"), foot: $("foot"),
};
const eyes = [el.eyeL, el.eyeR];
const CX = 30.55, CY = 33.7;

// Damped spring sampled into a CSS linear() easing, settled when the envelope drops under 0.3%.
function spring(freq, damping) {
  const w = 2 * Math.PI * freq;
  const wd = w * Math.sqrt(1 - damping * damping);
  const x = (t) => 1 - Math.exp(-damping * w * t) * (Math.cos(wd * t) + ((damping * w) / wd) * Math.sin(wd * t));
  const duration = Math.log(333) / (damping * w);
  if (!canLinear) return { duration, easing: "cubic-bezier(0.34, 1.45, 0.64, 1)" };
  const n = 48;
  const pts = Array.from({ length: n + 1 }, (_, i) => +x((i / n) * duration).toFixed(4));
  pts[n] = 1;
  return { duration, easing: `linear(${pts.join(",")})` };
}

const play = (target, keyframes, opts) => target.animate(keyframes, { fill: "both", ...opts });
const sleep = (t) => new Promise((r) => setTimeout(r, t));
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

  // 1. Power up. One clock drives the ring, the clockwise reveal of the mark and the leading spark.
  await sleep(140);
  const charge = 1300;
  const chargeOpts = { duration: charge, easing: EASE_CHARGE };
  play(el.track, [{ opacity: 0 }, { opacity: 1 }], { duration: 360, easing: EASE_OUT });
  play(el.ring, [{ opacity: 0, strokeDashoffset: 100 }, { opacity: 1, strokeDashoffset: 96, offset: 0.04 }, { opacity: 1, strokeDashoffset: 0 }], chargeOpts);
  play(el.sweep, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], chargeOpts);
  play(el.lead, [{ transform: "rotate(0deg)", opacity: 0 }, { transform: "rotate(30deg)", opacity: 1, offset: 0.04 }, { transform: "rotate(340deg)", opacity: 1, offset: 0.94 }, { transform: "rotate(360deg)", opacity: 0 }], chargeOpts);
  play(el.body, [{ transform: "scale(0.9)" }, { transform: "scale(1)" }], { duration: charge, easing: EASE_OUT });
  await sleep(charge);

  // 2. Power on. Burst, sparks, bounce, then the eyes wake up.
  el.body.removeAttribute("mask");
  el.ring.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: EASE_OUT, fill: "forwards" });
  el.track.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: EASE_OUT, fill: "forwards" });
  play(el.burst, [{ opacity: 0.7, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.38)" }], { duration: 760, easing: EASE_OUT });
  sparkBurst();
  play(el.body, [{ transform: "scale(1)" }, { transform: "scale(0.92)", offset: 0.16 }, { transform: "scale(1)" }], { duration: ms(sBody.duration) + 120, easing: sBody.easing, composite: "replace" });

  eyes.forEach((e, i) => play(e, [
    { transform: "scaleY(0.08)" },
    { transform: "scaleY(0.55)", offset: 0.2 },
    { transform: "scaleY(0.08)", offset: 0.34 },
    { transform: "scaleY(1)" },
  ], { duration: 520 + ms(sEye.duration) * 0.4, delay: 140 + i * 40, easing: EASE_OUT }));

  // 3. Lift into place while the title rises. The eyes glance down at it.
  hold.cancel();
  play(el.bot, [{ transform: liftFrom }, { transform: "translateY(0) scale(1)" }], { duration: 820, delay: 260, easing: EASE_PANEL });
  const scan = play(el.gaze, [
    { transform: "translate(0, 0)" },
    { transform: "translate(0, 3.4px)", offset: 0.22 },
    { transform: "translate(0, 3.4px)", offset: 0.78 },
    { transform: "translate(0, 0)" },
  ], { duration: 2300, delay: 800, easing: EASE_IN_OUT });

  el.words.forEach((w, i) => play(w, [{ transform: "translateY(108%)" }, { transform: "translateY(0)" }], { duration: 820, delay: 520 + i * 120, easing: EASE_OUT }));
  el.words.forEach((w, i) => play(w, [{ backgroundPosition: "110% 0, 0 0" }, { backgroundPosition: "0% 0, 0 0" }], { duration: 900, delay: 1500 + i * 170, easing: EASE_IN_OUT }));
  play(el.sub, [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 620, delay: 1000, easing: EASE_OUT });
  play(el.foot, [{ opacity: 0 }, { opacity: 1 }], { duration: 800, delay: 1500, easing: EASE_OUT });

  await sleep(3100);
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
