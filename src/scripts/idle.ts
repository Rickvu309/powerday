import { EASE_OUT, el, finePointer, play, sleep } from "./dom";
import { blink, sparkBurst, squint } from "./effects";
import { spring } from "./spring";

const MAX_X = 6.5;
const MAX_Y = 3.4;

/** Life after the intro. Random blinks, eyes that follow the pointer, and a tap that reacts. */
export function startIdle() {
  const tap = spring(3, 0.55);

  void (async function blinkLoop() {
    for (;;) {
      await sleep(2400 + Math.random() * 3200);
      if (document.hidden) continue;
      await blink();
      if (Math.random() < 0.22) {
        await sleep(110);
        await blink();
      }
    }
  })();

  let tx = 0;
  let ty = 0;
  let cx = 0;
  let cy = 0;
  let raf = 0;
  let settle: ReturnType<typeof setTimeout> | undefined;

  const tick = () => {
    cx += (tx - cx) * 0.14;
    cy += (ty - cy) * 0.14;
    el.gaze.style.transform = `translate(${cx.toFixed(2)}px, ${cy.toFixed(2)}px)`;
    if (finePointer) {
      el.bg.style.transform = `translate3d(${(-cx * 1.4).toFixed(2)}px, ${(-cy * 2.2).toFixed(2)}px, 0) scale(1.06)`;
    }
    raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.02 ? requestAnimationFrame(tick) : 0;
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };
  const lookAt = (clientX: number, clientY: number) => {
    const r = el.bot.getBoundingClientRect();
    const nx = (clientX - (r.left + r.width / 2)) / (innerWidth / 2);
    const ny = (clientY - (r.top + r.height / 2)) / (innerHeight / 2);
    tx = Math.max(-1, Math.min(1, nx)) * MAX_X;
    ty = Math.max(-1, Math.min(1, ny)) * MAX_Y;
    kick();
  };
  const lookAway = () => {
    tx = 0;
    ty = 0;
    kick();
  };

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

  const release = (celebrate: boolean) => {
    el.body.getAnimations().forEach((a) => a.cancel());
    if (celebrate) {
      play(el.body, [{ transform: "scale(0.94)" }, { transform: "scale(1)" }], {
        duration: tap.duration,
        easing: tap.easing,
        fill: "none",
      });
      sparkBurst(36);
      squint(800);
    }
    if (!finePointer) settle = setTimeout(lookAway, 900);
  };
  el.bot.addEventListener("pointerup", () => release(true));
  el.bot.addEventListener("pointercancel", () => release(false));
}
