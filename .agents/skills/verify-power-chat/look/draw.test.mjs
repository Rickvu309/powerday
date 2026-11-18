import assert from "node:assert/strict"
import { test } from "node:test"
import { arrow, place, radius, readCallouts } from "./draw.mjs"

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const circle = (point) => ({ x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 })

test("a circle never covers a target or another circle", () => {
  const targets = [
    { x: 100, y: 100, width: 200, height: 40 },
    { x: 110, y: 150, width: 180, height: 40 },
    { x: 0, y: 0, width: 50, height: 800 },
    null,
  ]
  const circles = place(targets, { width: 1280, height: 800 })
  assert.equal(circles[3], null)
  const shown = circles.filter(Boolean)
  for (const [index, point] of shown.entries()) {
    for (const target of targets.filter(Boolean)) assert.equal(overlaps(circle(point), target), false)
    for (const other of shown.slice(index + 1)) assert.equal(overlaps(circle(point), circle(other)), false)
  }
})

test("a circle avoids text when it has room", () => {
  const target = { x: 300, y: 300, width: 100, height: 40 }
  const text = { x: 0, y: 0, width: 1280, height: 290 }
  const [point] = place([target], { width: 1280, height: 800 }, [text])
  assert.equal(overlaps(circle(point), text), false)
})

test("an arrow stops 3 px outside its target", () => {
  const line = arrow({ x: 400, y: 120 }, { x: 100, y: 100, width: 200, height: 40 })
  assert.deepEqual(line.to, { x: 303, y: 120 })
})

test("callouts refuse a block with no path, a long note or an unknown target", () => {
  assert.throws(() => readCallouts(JSON.stringify([{ title: "t", callouts: [{ at: "a", note: "n" }] }])), /path/)
  assert.throws(
    () => readCallouts(JSON.stringify([{ path: "/", title: "t", callouts: [{ at: "a", note: "x".repeat(91) }] }])),
    /under 90/,
  )
  assert.throws(
    () => readCallouts(JSON.stringify([{ path: "/", title: "t", callouts: [{ at: "a", note: "n", target: "icon" }] }])),
    /target/,
  )
  const [listed] = readCallouts(
    JSON.stringify([{ path: "/", title: "t", callouts: [{ at: ["nav", "a[href='/admin']"], note: "n" }] }]),
  )
  assert.deepEqual(listed.callouts[0].at, ["nav", "a[href='/admin']"])
  const [block] = readCallouts(JSON.stringify([{ path: "/", title: "t", callouts: [{ at: "main", note: "n" }] }]))
  assert.equal(block.width, 1280)
  assert.equal(block.callouts[0].target, "element")
})
