import { EASE_IN_OUT, EASE_OUT, el, play } from "./dom";

export const CX = 30.55;
export const CY = 33.7;

const SQUINT = "scale(1.12, 0.38) translateY(1.4px)";

export const squint = (duration = 900) =>
  el.eyes.forEach((e) =>
    play(
      e,
      [
        { transform: "scale(1)" },
        { transform: SQUINT, offset: 0.22 },
        { transform: SQUINT, offset: 0.64 },
        { transform: "scale(1)" },
      ],
      { duration, easing: EASE_OUT, fill: "none" },
    ),
  );

export const blink = () =>
  Promise.all(
    el.eyes.map(
      (e) =>
        play(
          e,
          [
            { transform: "scaleY(1)" },
            { transform: "scaleY(0.08)", offset: 1 / 3, easing: EASE_OUT },
            { transform: "scaleY(1)" },
          ],
          { duration: 240, easing: EASE_IN_OUT, fill: "none" },
        ).finished,
    ),
  );

const SVG_NS = "http://www.w3.org/2000/svg";
const SPARK_COLORS = ["#e8462a", "#ff9a3d", "#ffb300", "#ffd54f"];

export function sparkBurst(radius = 38) {
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.22;
    const reach = 18 + (i % 3) * 7;
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("class", "spark");
    dot.setAttribute("r", String(i % 3 === 0 ? 1.7 : 1.1));
    dot.setAttribute("cx", String(CX + Math.cos(a) * radius));
    dot.setAttribute("cy", String(CY + Math.sin(a) * radius));
    dot.setAttribute("fill", SPARK_COLORS[i % SPARK_COLORS.length]);
    el.sparks.append(dot);
    const dx = Math.cos(a) * reach;
    const dy = Math.sin(a) * reach;
    const done = () => dot.remove();
    play(
      dot,
      [
        { transform: "translate(0,0) scale(0.2)", opacity: 0 },
        { transform: `translate(${dx * 0.55}px,${dy * 0.55}px) scale(1)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${dx}px,${dy}px) scale(0.4)`, opacity: 0 },
      ],
      { duration: 760, delay: i * 12, easing: EASE_OUT },
    ).finished.then(done, done);
  }
}
