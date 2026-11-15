import { expectAccepts, expectRejects } from "../harness.js"
import { rawExtensions, rawFindings } from "./no-raw.js"

const rule = { "powerday/no-raw": "error" }
const hex = "Use a theme token instead of a raw hex."
const motion = "Name the properties that change."
const color = "#" + "222222"
const transition = "transition-" + "all"
const paint = `export const paint = "${color}"\n`

expectRejects("a tsx string fails", "screen.tsx", paint, rule, hex)
expectAccepts("shape art passes", "shape-art.ts", paint, rule)
expectAccepts("a screen art component passes", "screen-art.tsx", paint, rule)
expectRejects("a screen component fails", "panel.tsx", paint, rule, hex)

const tokenFindings = rawFindings("apps/chat/src/styles/tokens.css", `x { color: ${color}; }\n`)
if (tokenFindings.length !== 0) throw new Error("token file should pass")

const artHtml = rawFindings("editor-demo-art.html", `x { color: ${color}; }\n`)
const plainHtml = rawFindings("editor-demo.html", `x { color: ${color}; }\n`)
if (artHtml.length !== 0 || plainHtml.length !== 1) throw new Error("html art allowance failed")

expectRejects("transition fails", "screen.tsx", `export const motion = "${transition}"\n`, rule, motion)
expectRejects("transition fails in art", "shape-art.ts", `export const motion = "${transition}"\n`, rule, motion)
const sized = "Use a theme token instead of a sized arbitrary class."
const height = "h-[" + "17px]"
const far = "h-[" + "720px]"
const type = "text-[" + "13px]"
const radius = "rounded-[" + "2px]"
const tokenSize = "h-[var(--space-16)]"
expectRejects("a near height fails", "screen.tsx", `export const size = "${height}"\n`, rule, sized)
expectRejects("a type size fails", "screen.tsx", `export const size = "${type}"\n`, rule, sized)
expectAccepts("a far height stays", "screen.tsx", `export const size = "${far}"\n`, rule)
expectAccepts("a far radius stays", "screen.tsx", `export const size = "${radius}"\n`, rule)
expectAccepts("a token size stays", "screen.tsx", `export const size = "${tokenSize}"\n`, rule)
expectAccepts("art keeps a near height", "shape-art.ts", `export const size = "${height}"\n`, rule)

const css = rawFindings("page.css", `x { color: ${color}; }\n`)
const html = rawFindings("page.html", `<p style="color:${color}"></p>\n`)
const svg = rawFindings("favicon.svg", `<svg fill="${color}"></svg>\n`)
const svgArt = rawFindings("favicon-art.svg", `<svg fill="${color}"></svg>\n`)
if (css.length !== 1 || html.length !== 1 || svg.length !== 1 || svgArt.length !== 0) {
  throw new Error("css and html walk failed")
}
if (!rawExtensions.has(".svg")) throw new Error("svg walk failed")
if (!css[0].message.includes("token") || !html[0].message.includes("token")) {
  throw new Error("css and html walk failed")
}

const mix = "color-" + "mix("
const mixMessage = "Use a theme token instead of a raw color mix."
expectRejects(
  "a color mix fails",
  "screen.tsx",
  `export const paint = "${mix}in oklch, red, blue)"\n`,
  rule,
  mixMessage,
)
const cssMix = rawFindings("page.css", `x { color: ${mix}in oklch, red, blue); }\n`)
const upperMix = rawFindings("page.css", `x { color: ${"Color-" + "Mix("}in oklch, red, blue); }\n`)
const tokenMix = rawFindings("apps/chat/src/styles/tokens.css", `x { color: ${mix}in oklch, red, blue); }\n`)
const artMix = rawFindings("shape-art.ts", `export const paint = "${mix}in oklch, red, blue)"\n`)
if (cssMix.length !== 1 || upperMix.length !== 1 || tokenMix.length !== 0 || artMix.length !== 0) {
  throw new Error("color mix walk failed")
}
if (!cssMix[0].message.includes("color mix") || !upperMix[0].message.includes("color mix")) {
  throw new Error("color mix walk failed")
}

console.log("no-raw tests passed")
