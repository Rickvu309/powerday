const $ = (id) => document.getElementById(id);
const css = getComputedStyle(document.documentElement);
const EASE_OUT = css.getPropertyValue("--ease-out").trim();
const EASE_PANEL = css.getPropertyValue("--ease-panel").trim();
const EASE_IN_OUT = css.getPropertyValue("--ease-in-out").trim();

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
const canLinear = CSS.supports("animation-timing-function", "linear(0, 1)");

const el = {
  glow: document.querySelector(".glow"),
  bot: $("bot"), body: $("body"), gaze: $("gaze"),
  eyeL: $("eyeL"), eyeR: $("eyeR"),
  ring: $("ring"), burst: $("burst"), sparks: $("sparks"),
  words: [...document.querySelectorAll(".title .w")],
  sub: $("sub"), foot: $("foot"), stage: $("stage"),
  track: document.querySelector(".ring-track"),
};
const eyes = [el.eyeL, el.eyeR];

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ms = (s) => s * 1000;

function blink(duration = 1) {
  const closeMs = 80 * duration, openMs = 160 * duration;
  return Promise.all(eyes.map((e) =>
    play(e, [{ transform: "scaleY(1)" }, { transform: "scaleY(0.08)", offset: closeMs / (closeMs + openMs), easing: EASE_OUT }, { transform: "scaleY(1)" }],
      { duration: closeMs + openMs, easing: EASE_IN_OUT, fill: "none" }).finished));
}

function sparkBurst() {
  const NS = "http://www.w3.org/2000/svg";
  const colors = ["#e8462a", "#ff9a3d", "#ffb300", "#ffd54f"];
  const cx = 30.55, cy = 33.7;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.22;
    const r0 = 38, r1 = 56 + (i % 3) * 7;
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("class", "spark");
    c.setAttribute("r", i % 3 === 0 ? 1.7 : 1.1);
    c.setAttribute("cx", cx + Math.cos(a) * r0);
    c.setAttribute("cy", cy + Math.sin(a) * r0);
    c.setAttribute("fill", colors[i % colors.length]);
    el.sparks.append(c);
    const dx = Math.cos(a) * (r1 - r0), dy = Math.sin(a) * (r1 - r0);
    play(c, [
      { transform: "translate(0,0) scale(0.2)", opacity: 0 },
      { transform: `translate(${dx * 0.55}px,${dy * 0.55}px) scale(1)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${dx}px,${dy}px) scale(0.4)`, opacity: 0 },
    ], { duration: 760, delay: i * 12, easing: EASE_OUT }).finished.then(() => c.remove());
  }
}

async function intro() {
  const sBody = spring(2.1, 0.62);
  const sEye = spring(2.8, 0.7);
  const sDone = spring(2.4, 0.72);

  // Bot starts large and centered in the viewport, then settles into the stack above the title.
  const stage = el.stage.getBoundingClientRect();
  const bot = el.bot.getBoundingClientRect();
  const dy = stage.top + stage.height / 2 - (bot.top + bot.height / 2);
  const liftFrom = `translateY(${dy}px) scale(1.18)`;
  const lift = play(el.bot, [{ transform: liftFrom }, { transform: liftFrom }], { duration: 1 });

  play(el.glow, [{ opacity: 0 }, { opacity: 1 }], { duration: 1600, easing: EASE_PANEL });

  // 1. Body pops in, eyes open as dots then grow.
  await sleep(160);
  play(el.body, [{ opacity: 0, transform: "scale(0.7)" }, { opacity: 1, transform: "scale(1)" }], { duration: ms(sBody.duration), easing: sBody.easing });
  play(el.track, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 500, easing: EASE_OUT });
  eyes.forEach((e, i) => play(e, [{ transform: "scale(0)" }, { transform: "scale(1)" }], { duration: ms(sEye.duration), delay: 380 + i * 55, easing: sEye.easing }));

  // 2. Working: ring fills while the eyes scan right then left.
  await sleep(1000);
  const ringDur = 1250;
  play(el.ring, [{ opacity: 1, strokeDashoffset: 100 }, { opacity: 1, strokeDashoffset: 0 }], { duration: ringDur, easing: "linear" });
  const scan = play(el.gaze, [{ transform: "translateX(0)" }, { transform: "translateX(5.5px)", offset: 0.28 }, { transform: "translateX(5.5px)", offset: 0.4 }, { transform: "translateX(-5.5px)", offset: 0.78 }, { transform: "translateX(0)" }], { duration: ringDur, easing: EASE_IN_OUT });
  await sleep(ringDur);
  scan.cancel();

  // 3. Done: ring burst, sparks, bot bounce, eyes squint happy, settle into stack.
  el.ring.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: EASE_OUT, fill: "forwards" });
  el.track.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: EASE_OUT, fill: "forwards" });
  play(el.burst, [{ opacity: 0.7, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.38)" }], { duration: 760, easing: EASE_OUT });
  sparkBurst();
  play(el.body, [{ transform: "scale(1)" }, { transform: "scale(0.93)", offset: 0.18 }, { transform: "scale(1)" }], { duration: ms(sDone.duration) + 120, easing: sDone.easing, composite: "replace" });
  eyes.forEach((e) => play(e, [{ transform: "scale(1)" }, { transform: "scale(1.12, 0.38) translateY(1.4px)", offset: 0.22 }, { transform: "scale(1.12, 0.38) translateY(1.4px)", offset: 0.66 }, { transform: "scale(1)" }], { duration: 900, easing: EASE_OUT, fill: "none" }));

  lift.cancel();
  play(el.bot, [{ transform: liftFrom }, { transform: "translateY(0) scale(1)" }], { duration: 760, easing: EASE_PANEL });

  // 4. Title words rise with blur-in, then subline and footer.
  el.words.forEach((w, i) => play(w, [
    { opacity: 0, transform: "translateY(26px)", filter: "blur(8px)" },
    { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
  ], { duration: 700, delay: 260 + i * 110, easing: EASE_OUT }));
  play(el.sub, [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 600, delay: 620, easing: EASE_OUT });
  play(el.foot, [{ opacity: 0 }, { opacity: 1 }], { duration: 800, delay: 1000, easing: EASE_OUT });

  await sleep(1500);
  document.documentElement.classList.add("ready");
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

  if (finePointer) {
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const MAX_X = 6.5, MAX_Y = 3.2;
    const tick = () => {
      cx += (tx - cx) * 0.14; cy += (ty - cy) * 0.14;
      el.gaze.style.transform = `translate(${cx.toFixed(2)}px, ${cy.toFixed(2)}px)`;
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.02 ? requestAnimationFrame(tick) : 0;
    };
    addEventListener("pointermove", (e) => {
      const r = el.bot.getBoundingClientRect();
      const nx = (e.clientX - (r.left + r.width / 2)) / (innerWidth / 2);
      const ny = (e.clientY - (r.top + r.height / 2)) / (innerHeight / 2);
      tx = Math.max(-1, Math.min(1, nx)) * MAX_X;
      ty = Math.max(-1, Math.min(1, ny)) * MAX_Y;
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick); });
  }

  el.bot.addEventListener("pointerdown", () => {
    play(el.body, [{ transform: "scale(0.94)" }], { duration: 120, easing: EASE_OUT, composite: "replace" }).finished.catch(() => {});
  });
  const release = () => {
    el.body.getAnimations().forEach((a) => a.cancel());
    play(el.body, [{ transform: "scale(0.94)" }, { transform: "scale(1)" }], { duration: ms(sTap.duration), easing: sTap.easing, fill: "none" });
    sparkBurst();
    eyes.forEach((e) => play(e, [{ transform: "scale(1)" }, { transform: "scale(1.12, 0.4) translateY(1.4px)", offset: 0.25 }, { transform: "scale(1.12, 0.4) translateY(1.4px)", offset: 0.6 }, { transform: "scale(1)" }], { duration: 800, easing: EASE_OUT, fill: "none" }));
  };
  el.bot.addEventListener("pointerup", release);
}

if (!reduced) intro();
