import { writeFile } from "node:fs/promises"
import { expect, test } from "@playwright/test"
import { withChatFixtures } from "./chat-fixtures"

for (let run = 1; run <= 5; run++) {
  test(`typing stays under 100 ms during a 5,000-token reply, run ${run}`, async ({ page }, testInfo) => {
    test.setTimeout(60_000)
    await withChatFixtures(page)
    await page.setViewportSize({ width: 375, height: 900 })
    await page.goto("/screens/02-streaming-reply?tokens=5000")
    const input = page.getByRole("textbox", { name: "Message" })
    await expect(page.locator(".is-assistant")).toContainText("Debouncing")
    const measure = page.evaluate(() => {
      const input = document.querySelector("textarea")
      const composer = input?.closest("form")
      if (!input || !composer) throw new Error("Composer missing")
      const initial = composer.getBoundingClientRect()
      const kind = PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")
        ? "long-animation-frame"
        : "longtask"
      if (!PerformanceObserver.supportedEntryTypes.includes(kind)) throw new Error("Long frame observation unsupported")
      const entries: PerformanceEntry[] = []
      const observer = new PerformanceObserver((list) => entries.push(...list.getEntries()))
      observer.observe({ type: kind })
      const started = performance.now()
      const inputDelays: number[] = []
      const keyToPaint: number[] = []
      let maxShift = 0
      let frames = 0
      let keyStarted = 0
      const onKey = (event: KeyboardEvent) => {
        inputDelays.push(Math.max(0, performance.now() - event.timeStamp))
        keyStarted = performance.now()
      }
      const onInput = () => {
        const started = keyStarted
        requestAnimationFrame(() => requestAnimationFrame(() => keyToPaint.push(performance.now() - started)))
      }
      input.addEventListener("keydown", onKey)
      input.addEventListener("input", onInput)
      let frame = 0
      const sample = () => {
        const rect = composer.getBoundingClientRect()
        maxShift = Math.max(maxShift, Math.abs(rect.top - initial.top), Math.abs(rect.bottom - initial.bottom))
        frames++
        frame = requestAnimationFrame(sample)
      }
      frame = requestAnimationFrame(sample)
      return new Promise<{
        kind: string
        elapsedMs: number
        longMs: number
        longEntries: number
        frames: number
        maxShift: number
        inputDelays: number[]
        keyToPaint: number[]
        tokens: number
      }>((resolve) => {
        const interval = setInterval(() => {
          if (document.querySelector('button[aria-label="Stop display"]')) return
          clearInterval(interval)
          cancelAnimationFrame(frame)
          entries.push(...observer.takeRecords())
          observer.disconnect()
          input.removeEventListener("keydown", onKey)
          input.removeEventListener("input", onInput)
          resolve({
            kind,
            elapsedMs: performance.now() - started,
            longMs: entries.reduce((total, entry) => total + entry.duration, 0),
            longEntries: entries.length,
            frames,
            maxShift,
            inputDelays,
            keyToPaint,
            tokens: Number(
              performance
                .getEntriesByName("fake-reply-complete")
                .filter((entry): entry is PerformanceMark => entry.entryType === "mark")
                .at(-1)?.detail,
            ),
          })
        }, 50)
      })
    })

    await input.pressSequentially("Keep typing while the reply arrives", { delay: 40 })
    await expect(page.getByRole("button", { name: "Stop display", exact: true })).toBeHidden({ timeout: 45_000 })
    const result = await measure
    const path = testInfo.outputPath("speed.json")
    await writeFile(path, JSON.stringify(result, null, 2))
    await testInfo.attach("speed.json", { path, contentType: "application/json" })
    expect(result.tokens).toBe(5000)
    expect(result.frames).toBeGreaterThan(50)
    expect(result.inputDelays.length).toBeGreaterThanOrEqual(30)
    expect(Math.max(...result.inputDelays)).toBeLessThan(100)
    expect(result.keyToPaint).toHaveLength(result.inputDelays.length)
    expect(result.maxShift).toBeLessThanOrEqual(1)
    expect(result.longMs / result.elapsedMs).toBeLessThan(0.2)
    await expect(page.locator(".is-assistant")).toContainText("Part 9")
    await expect(input).toHaveValue("Keep typing while the reply arrives")
  })
}
