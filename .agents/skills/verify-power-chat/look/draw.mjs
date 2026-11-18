import { readFileSync } from "node:fs"
import path from "node:path"

export const radius = 12
export const margin = 30
export const noteLimit = 90

const escape = (text) =>
  String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")

const filled = (value) => typeof value === "string" && value.trim() !== ""

const isBox = (value) =>
  value !== null &&
  typeof value === "object" &&
  ["x", "y", "width", "height"].every((key) => Number.isFinite(value[key])) &&
  value.width > 0 &&
  value.height > 0

export function readCallouts(text) {
  const blocks = JSON.parse(text)
  if (!Array.isArray(blocks) || blocks.length === 0) throw new Error("callouts must be a non-empty array of blocks")
  return blocks.map((block, index) => {
    const where = `block ${String(index + 1)}`
    if (!filled(block?.path)) throw new Error(`${where} needs a "path" such as "/" or "/screens/01-empty"`)
    if (!filled(block.title)) throw new Error(`${where} needs a "title"`)
    if (block.crop !== undefined && !filled(block.crop) && !isBox(block.crop))
      throw new Error(`${where} "crop" must be a selector or a box in CSS px`)
    if (!Array.isArray(block.callouts) || block.callouts.length === 0)
      throw new Error(`${where} needs at least one callout`)
    const callouts = block.callouts.map((callout, at) => {
      const spot = `${where} callout ${String(at + 1)}`
      const place = callout?.at
      const selectors = Array.isArray(place) && place.length > 0 && place.every(filled)
      if (!filled(place) && !isBox(place) && !selectors)
        throw new Error(`${spot} "at" must be a selector, a list of selectors or a box`)
      if (!filled(callout.note)) throw new Error(`${spot} needs a "note"`)
      if (callout.note.length > noteLimit)
        throw new Error(`${spot} note is ${String(callout.note.length)} characters; keep it under ${String(noteLimit)}`)
      if (callout.target !== undefined && callout.target !== "text" && callout.target !== "element")
        throw new Error(`${spot} "target" is "text" or "element"`)
      return { at: callout.at, note: callout.note.trim(), target: callout.target ?? "element" }
    })
    return {
      path: block.path,
      title: block.title.trim(),
      width: Number.isFinite(block.width) ? block.width : 1280,
      height: Number.isFinite(block.height) ? block.height : 800,
      scheme: block.scheme === "dark" ? "dark" : "light",
      as: filled(block.as) ? block.as : undefined,
      click: Array.isArray(block.click) ? block.click.filter(filled) : [],
      say: filled(block.say) ? block.say : undefined,
      crop: block.crop,
      callouts,
    }
  })
}

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

const circleBox = (point) => ({
  x: point.x - radius,
  y: point.y - radius,
  width: radius * 2,
  height: radius * 2,
})

export function place(targets, frame, obstacles = []) {
  const taken = []
  return targets.map((target) => {
    if (target === null || target === undefined) return null
    const middle = { x: target.x + target.width / 2, y: target.y + target.height / 2 }
    const gap = radius + 14
    const room = {
      left: target.x,
      right: frame.width - (target.x + target.width),
      above: target.y,
      below: frame.height - (target.y + target.height),
    }
    const order = Object.entries(room)
      .sort((a, b) => b[1] - a[1])
      .map(([side]) => side)
    const candidates = order.flatMap((side) =>
      [0, -1, 1, -2, 2, -3, 3].map((step) => {
        const shift = step * (radius * 2 + 6)
        if (side === "left") return { x: target.x - gap, y: middle.y + shift }
        if (side === "right") return { x: target.x + target.width + gap, y: middle.y + shift }
        if (side === "above") return { x: middle.x + shift, y: target.y - gap }
        return { x: middle.x + shift, y: target.y + target.height + gap }
      }),
    )
    const inside = (point) =>
      point.x >= -margin + radius &&
      point.y >= -margin + radius &&
      point.x <= frame.width + margin - radius &&
      point.y <= frame.height + margin - radius
    const clear = (point) =>
      inside(point) &&
      !taken.some((box) => overlaps(box, circleBox(point))) &&
      !targets.some((other) => other && overlaps(other, circleBox(point)))
    const free = (point) => clear(point) && !obstacles.some((box) => overlaps(box, circleBox(point)))
    const chosen = candidates.find(free) ??
      candidates.find(clear) ??
      candidates.find(inside) ?? { x: middle.x, y: target.y - gap }
    taken.push(circleBox(chosen))
    return chosen
  })
}

export function arrow(from, box) {
  const x = Math.max(box.x - 3, Math.min(from.x, box.x + box.width + 3))
  const y = Math.max(box.y - 3, Math.min(from.y, box.y + box.height + 3))
  const dx = x - from.x
  const dy = y - from.y
  const length = Math.hypot(dx, dy)
  if (length <= radius + 2) return null
  return { from: { x: from.x + (dx / length) * radius, y: from.y + (dy / length) * radius }, to: { x, y } }
}

export function themeCss(repo) {
  const tokens = readFileSync(path.join(repo, "apps/chat/src/styles/tokens.css"), "utf8").match(/:root\s*\{[^}]*\}/)
  return `${tokens?.[0] ?? ""}:root{--callout:var(--primary)}`
}

const base = `*{box-sizing:border-box}html,body{margin:0;background:var(--secondary)}
body{font-family:ui-sans-serif,system-ui,sans-serif;color:var(--foreground);-webkit-font-smoothing:antialiased}
main{display:flex;flex-direction:column;gap:14px;padding:14px;width:max-content}
article{background:var(--background);border:1px solid var(--border);border-radius:10px;padding:18px}
h2{margin:0 0 10px;font-size:15px;line-height:20px;font-weight:600}
.pair{display:flex;gap:16px;align-items:flex-start}.pair.stacked{flex-direction:column}
.label{font-size:11px;line-height:14px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted-foreground);margin:0 0 4px ${String(margin)}px}
.frame{position:relative}.frame img{position:absolute;border:1px solid var(--border);border-radius:4px;display:block}
.frame svg{position:absolute;left:0;top:0;overflow:visible}
ol{list-style:none;margin:12px 0 0;padding:12px 0 0;border-top:1px solid var(--border);display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;max-width:1100px}
li{display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:18px}
.number{flex:none;width:18px;height:18px;border-radius:50%;background:var(--callout);color:var(--primary-foreground);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center}
.missing{color:var(--muted-foreground)}
table{border-collapse:collapse;font-size:13px;margin-top:12px}td,th{padding:4px 10px;border-bottom:1px solid var(--border);text-align:left}th{color:var(--muted-foreground);font-weight:600}`

function frameHtml(side, scale, stroke) {
  const width = side.width * scale
  const height = side.height * scale
  const sized = (box) =>
    box ? { x: box.x * scale, y: box.y * scale, width: box.width * scale, height: box.height * scale } : null
  const boxes = side.boxes.map(sized)
  const circles = place(boxes, { width, height }, (side.texts ?? []).map(sized))
  const shift = (point) => ({ x: point.x + margin, y: point.y + margin })
  const parts = boxes.map((box, index) => {
    const circle = circles[index]
    if (box === null || circle === null || circle === undefined) return ""
    const color = side.colors?.[index] ?? stroke
    const outline = `<rect x="${(box.x + margin).toFixed(1)}" y="${(box.y + margin).toFixed(1)}" width="${box.width.toFixed(1)}" height="${box.height.toFixed(1)}" rx="3" fill="none" stroke="${color}" stroke-width="2"/>`
    const line = arrow(circle, box)
    const drawn =
      line === null
        ? ""
        : `<polyline points="${shift(line.from).x},${shift(line.from).y} ${shift(line.to).x},${shift(line.to).y}" stroke="var(--background)" stroke-width="6" stroke-linecap="round" fill="none"/><polyline points="${shift(line.from).x},${shift(line.from).y} ${shift(line.to).x},${shift(line.to).y}" stroke="${color}" stroke-width="2.5" stroke-linecap="round" fill="none"/>`
    const dot = shift(circle)
    return `${outline}${drawn}<g data-callout="${String(index + 1)}"><circle cx="${dot.x}" cy="${dot.y}" r="${String(radius)}" fill="${color}" stroke="var(--background)" stroke-width="2.5"/><text x="${dot.x}" y="${dot.y}" dy=".36em" text-anchor="middle" font-size="13" font-weight="700" fill="var(--primary-foreground)">${String(index + 1)}</text></g>`
  })
  return `<section>${side.label ? `<p class="label">${escape(side.label)}</p>` : ""}<div class="frame" style="width:${(width + margin * 2).toFixed(1)}px;height:${(height + margin * 2).toFixed(1)}px"><img src="${side.image}" style="left:${String(margin)}px;top:${String(margin)}px;width:${width.toFixed(1)}px;height:${height.toFixed(1)}px"><svg width="${(width + margin * 2).toFixed(1)}" height="${(height + margin * 2).toFixed(1)}">${parts.join("")}</svg></div></section>`
}

export function blockHtml(block, { maxWidth = 1100 } = {}) {
  const widest = Math.max(...block.sides.map((side) => side.width))
  const besideScale = Math.min(1, (maxWidth - 16 * (block.sides.length - 1)) / block.sides.length / widest)
  const stackedScale = Math.min(1, maxWidth / widest)
  const sideBySide = block.sides.length === 1 || besideScale >= stackedScale * 0.6
  const scale = sideBySide ? besideScale : stackedScale
  const frames = block.sides.map((side) => frameHtml(side, scale, "var(--callout)")).join("")
  const legend = block.notes
    .map((note, index) => {
      const missing = block.sides.filter((side) => side.boxes[index] === null).map((side) => side.label)
      const tail = missing.length > 0 ? ` <span class="missing">(not on ${escape(missing.join(", "))})</span>` : ""
      return `<li><span class="number" style="background:${block.sides[0].colors?.[index] ?? "var(--callout)"}">${String(index + 1)}</span><span>${escape(note)}${tail}</span></li>`
    })
    .join("")
  return `<article><h2>${escape(block.title)}</h2><div class="pair${sideBySide ? "" : " stacked"}">${frames}</div>${legend ? `<ol>${legend}</ol>` : ""}${block.table ?? ""}</article>`
}

export const pageHtml = (articles, css) =>
  `<!doctype html><meta charset="utf-8"><style>${css}${base}</style><main>${articles.join("\n")}</main>`

export function tableHtml(rows) {
  if (rows.length === 0) return ""
  const head = Object.keys(rows[0])
  return `<table><tr>${head.map((key) => `<th>${escape(key)}</th>`).join("")}</tr>${rows
    .map((row) => `<tr>${head.map((key) => `<td>${escape(row[key])}</td>`).join("")}</tr>`)
    .join("")}</table>`
}
