export const detectors = [
  {
    name: "page-overflow",
    rank: 1,
    catches: "an element that reaches past the right edge and scrolls the page sideways",
  },
  { name: "unnamed-control", rank: 1, catches: "a visible button, link or field with no accessible name" },
  { name: "cut-text", rank: 2, catches: "text cut by its box: an ellipsis, a line clamp or hidden overflow" },
  {
    name: "small-target",
    rank: 2,
    catches: "a control with a side under 24 CSS px and an area under 24 by 24 (WCAG 2.5.8)",
  },
  { name: "text-contrast", rank: 2, catches: "text under WCAG AA against the solid colors painted under it" },
]

export function scan() {
  const findings = []
  const width = document.documentElement.clientWidth
  const visuallyHidden = (element) => {
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      const style = getComputedStyle(node)
      const box = node.getBoundingClientRect()
      if (style.position === "absolute" && box.width <= 1 && box.height <= 1) return true
      if (style.clipPath === "inset(50%)" || style.clip === "rect(0px, 0px, 0px, 0px)") return true
    }
    return false
  }
  const visible = (element) => {
    const box = element.getBoundingClientRect()
    if (box.width === 0 || box.height === 0 || visuallyHidden(element)) return false
    const style = getComputedStyle(element)
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false
    return element.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true
  }
  const selectorOf = (element) => {
    const parts = []
    let node = element
    while (node && node.nodeType === 1 && parts.length < 4) {
      if (node.id) {
        parts.unshift(`#${CSS.escape(node.id)}`)
        break
      }
      const label = node.getAttribute("aria-label")
      const slot = node.getAttribute("data-slot")
      let part = node.localName
      if (label) part += `[aria-label="${label.replaceAll('"', '\\"')}"]`
      else if (slot) part += `[data-slot="${slot}"]`
      parts.unshift(part)
      if (label) break
      node = node.parentElement
    }
    return parts.join(" > ")
  }
  const boxOf = (element) => {
    const box = element.getBoundingClientRect()
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  }
  const add = (name, rank, element, message) =>
    findings.push({ detector: name, rank, selector: selectorOf(element), box: boxOf(element), message })

  if (document.documentElement.scrollWidth > width + 1) {
    const culprits = [...document.body.querySelectorAll("*")].filter((element) => {
      if (!visible(element)) return false
      const box = element.getBoundingClientRect()
      if (box.right <= width + 1) return false
      return !element.parentElement || element.parentElement.getBoundingClientRect().right <= width + 1
    })
    for (const element of culprits.slice(0, 5))
      add(
        "page-overflow",
        1,
        element,
        `Ends ${String(Math.round(element.getBoundingClientRect().right - width))} px past the edge`,
      )
  }

  const controls = document.querySelectorAll(
    "a[href], button, input:not([type=hidden]), textarea, select, [role=button], [role=link], [role=menuitem], [role=tab], [role=searchbox], [role=textbox]",
  )
  for (const element of controls) {
    if (!visible(element) || element.closest("[aria-hidden=true], [inert]")) continue
    const labelledBy = (element.getAttribute("aria-labelledby") ?? "")
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join("")
    const labels =
      "labels" in element && element.labels ? [...element.labels].map((label) => label.textContent).join("") : ""
    const name = [
      element.getAttribute("aria-label"),
      labelledBy,
      labels,
      element.getAttribute("title"),
      element.localName === "input" || element.localName === "textarea" ? "" : element.textContent,
      element.querySelector("img[alt]")?.getAttribute("alt"),
    ]
      .filter(Boolean)
      .join("")
      .trim()
    if (name === "") add("unnamed-control", 1, element, "No accessible name")
    const box = element.getBoundingClientRect()
    const inline = getComputedStyle(element).display === "inline" && element.closest("p, li")
    if (!inline && Math.min(box.width, box.height) < 24 && box.width * box.height < 24 * 24)
      add(
        "small-target",
        2,
        element,
        `Target is ${String(Math.round(box.width))} by ${String(Math.round(box.height))} px`,
      )
  }

  const textHolders = [...document.body.querySelectorAll("*")].filter((element) =>
    [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim() !== ""),
  )
  const parse = (color) => {
    const match = color.match(/rgba?\(([^)]+)\)/)
    if (!match) return null
    const [r, g, b, a = "1"] = match[1].split(/[\s,/]+/).filter(Boolean)
    return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) }
  }
  const blend = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  })
  const luminance = ({ r, g, b }) => {
    const channel = (value) => {
      const unit = value / 255
      return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  }
  const backgroundOf = (element) => {
    const layers = []
    let node = element
    while (node && node.nodeType === 1) {
      const style = getComputedStyle(node)
      if (style.backgroundImage !== "none" || style.filter !== "none" || style.backdropFilter !== "none") return null
      const color = parse(style.backgroundColor)
      if (color === null) return null
      if (color.a > 0) layers.push(color)
      if (color.a >= 1) break
      node = node.parentElement
    }
    return layers.reduceRight((under, top) => blend(top, under), { r: 255, g: 255, b: 255, a: 1 })
  }
  for (const element of textHolders) {
    if (!visible(element)) continue
    const style = getComputedStyle(element)
    const clips = (axis) => ["hidden", "clip"].includes(axis)
    const cutAcross =
      (clips(style.overflowX) || style.textOverflow === "ellipsis") && element.scrollWidth > element.clientWidth + 1
    const cutDown =
      (clips(style.overflowY) || style.webkitLineClamp !== "none") && element.scrollHeight > element.clientHeight + 2
    if (cutAcross || cutDown) add("cut-text", 2, element, `“${element.textContent.trim().slice(0, 40)}” is cut`)
    if (element.closest("[aria-disabled=true], :disabled")) continue
    const ink = parse(style.color)
    const under = backgroundOf(element)
    if (ink === null || under === null) continue
    const opacity = [...Array(8)].reduce(
      (state) => {
        if (!state.node) return state
        return { value: state.value * Number(getComputedStyle(state.node).opacity), node: state.node.parentElement }
      },
      { value: 1, node: element },
    ).value
    const shown = blend({ ...ink, a: ink.a * opacity }, under)
    const [light, dark] = [luminance(shown), luminance(under)].sort((a, b) => b - a)
    const ratio = (light + 0.05) / (dark + 0.05)
    const size = Number.parseFloat(style.fontSize)
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
    const needed = large ? 3 : 4.5
    if (ratio < needed) add("text-contrast", 2, element, `Contrast ${ratio.toFixed(2)}:1, needs ${String(needed)}:1`)
  }

  const seen = new Set()
  return findings
    .filter((finding) => {
      const key = `${finding.detector} ${finding.selector} ${Math.round(finding.box.x)} ${Math.round(finding.box.y)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.rank - b.rank || a.box.y - b.box.y || a.box.x - b.box.x)
}
