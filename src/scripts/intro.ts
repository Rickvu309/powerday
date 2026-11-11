import { assemble } from "./assemble";
import { EASE_IN_OUT, EASE_OUT, EASE_PANEL, el, frame, play, sleep } from "./dom";
import { sparkBurst, squint } from "./effects";
import { startIdle } from "./idle";
import { spring } from "./spring";

/**
 * Wait for what the first frame depends on, so nothing shifts or pops mid-intro. Capped so a slow
 * font or image never holds the page hostage.
 */
async function ready() {
  const settled = Promise.all([document.fonts.ready, el.photo.decode().catch(() => undefined)]);
  await Promise.race([settled, sleep(1500)]);
}

export async function intro() {
  await ready();
  const body = spring(2.4, 0.72);
  const eye = spring(3, 0.62);

  // The mark starts large and centered, then lifts into the stack above the title.
  const stage = el.stage.getBoundingClientRect();
  const bot = el.bot.getBoundingClientRect();
  const dy = stage.top + stage.height / 2 - (bot.top + bot.height / 2);
  const liftFrom = `translateY(${dy}px) scale(1.18)`;
  const hold = play(el.bot, [{ transform: liftFrom }, { transform: liftFrom }], { duration: 1 });
  play(el.photo, [{ opacity: 0, transform: "scale(1.14)" }, { opacity: 1, transform: "scale(1)" }], {
    duration: 2600,
    easing: EASE_OUT,
  });
  await frame();

  // 1. Assemble. Particles spiral in and lock to the outline of the mark.
  const dust = await assemble();

  // 2. Power on. The vector takes over, burst and sparks, the eyes wake up.
  play(el.body, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE_OUT });
  void dust
    .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: EASE_OUT, fill: "forwards" })
    .finished.then(() => dust.remove());
  play(el.burst, [{ opacity: 0.7, transform: "scale(0.72)" }, { opacity: 0, transform: "scale(1.45)" }], {
    duration: 800,
    easing: EASE_OUT,
  });
  sparkBurst();
  play(el.body, [{ transform: "scale(0.93)" }, { transform: "scale(1)" }], {
    duration: body.duration,
    easing: body.easing,
    composite: "replace",
  });

  el.eyes.forEach((e, i) =>
    play(
      e,
      [
        { transform: "scaleY(0.08)" },
        { transform: "scaleY(0.55)", offset: 0.2 },
        { transform: "scaleY(0.08)", offset: 0.34 },
        { transform: "scaleY(1)" },
      ],
      { duration: 520 + eye.duration * 0.4, delay: 160 + i * 40, easing: EASE_OUT },
    ),
  );

  // 3. Lift into place while the title rises. The eyes glance down at it.
  hold.cancel();
  play(el.bot, [{ transform: liftFrom }, { transform: "translateY(0) scale(1)" }], {
    duration: 820,
    delay: 240,
    easing: EASE_PANEL,
  });
  const scan = play(
    el.gaze,
    [
      { transform: "translate(0, 0)" },
      { transform: "translate(0, 3.4px)", offset: 0.22 },
      { transform: "translate(0, 3.4px)", offset: 0.78 },
      { transform: "translate(0, 0)" },
    ],
    { duration: 2100, delay: 700, easing: EASE_IN_OUT },
  );

  el.words.forEach((w, i) => {
    play(w, [{ transform: "translateY(108%)" }, { transform: "translateY(0)" }], {
      duration: 820,
      delay: 420 + i * 120,
      easing: EASE_OUT,
    });
    play(w, [{ backgroundPosition: "110% 0, 0 0" }, { backgroundPosition: "0% 0, 0 0" }], {
      duration: 900,
      delay: 1250 + i * 170,
      easing: EASE_IN_OUT,
    });
  });
  play(el.sub, [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "translateY(0)" }], {
    duration: 620,
    delay: 900,
    easing: EASE_OUT,
  });
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
