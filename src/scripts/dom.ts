const $ = <T extends Element>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} is missing from the page`);
  return node as unknown as T;
};

const css = getComputedStyle(document.documentElement);
const token = (name: string) => css.getPropertyValue(name).trim();

export const EASE_OUT = token("--ease-out");
export const EASE_PANEL = token("--ease-panel");
export const EASE_IN_OUT = token("--ease-in-out");

export const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

const eyeL = $<SVGPathElement>("eyeL");
const eyeR = $<SVGPathElement>("eyeR");

export const el = {
  bg: $<HTMLElement>("bg"),
  photo: $<HTMLImageElement>("photo"),
  stage: $<HTMLElement>("stage"),
  bot: $<SVGSVGElement>("bot"),
  body: $<SVGGElement>("body"),
  gaze: $<SVGGElement>("gaze"),
  burst: $<SVGCircleElement>("burst"),
  sparks: $<SVGGElement>("sparks"),
  sub: $<HTMLElement>("sub"),
  words: [...document.querySelectorAll<HTMLElement>(".title .w")],
  eyeL,
  eyeR,
  eyes: [eyeL, eyeR],
};

export const play = (target: Element, keyframes: Keyframe[], opts: KeyframeAnimationOptions): Animation =>
  target.animate(keyframes, { fill: "both", ...opts });

export const sleep = (t: number) => new Promise<void>((r) => setTimeout(r, t));
export const frame = () => new Promise<number>((r) => requestAnimationFrame(r));
