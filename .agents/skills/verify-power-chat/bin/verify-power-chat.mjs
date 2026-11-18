#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { homedir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { detectors, scan } from "../look/detectors.mjs"
import { blockHtml, pageHtml, readCallouts, tableHtml, themeCss } from "../look/draw.mjs"

const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: skill, encoding: "utf8" }).trim()
const home = process.env.VERIFY_POWER_CHAT_HOME ?? path.join(homedir(), "tmp")
const evidenceRoot = path.join(home, "verify-power-chat")
const scratchRoot = path.join(home, "verify-power-chat-scratch")
const defaultAccount = "person@powerday.work"
const rankColor = { 1: "var(--destructive)", 2: "var(--primary)", 3: "var(--muted-foreground)" }

const print = (value) => console.log(JSON.stringify(value))
const fail = (message) => {
  console.error(message)
  process.exit(1)
}

const flags = (args) => {
  const named = {}
  const plain = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith("--")) {
      plain.push(arg)
      continue
    }
    const key = arg.slice(2)
    const next = args[index + 1]
    const value = next === undefined || next.startsWith("--") ? true : next
    if (value !== true) index += 1
    named[key] = key in named ? [named[key], value].flat() : value
  }
  return { named, plain }
}

const list = (value) => (value === undefined ? [] : [value].flat().filter((each) => each !== true))

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })

const statePath = (run) => path.join(scratchRoot, run, "state.json")
const readState = (run) => {
  if (!run) fail("Name the run. `launch` printed it.")
  if (!existsSync(statePath(run))) fail(`No run ${run}. Launch one first.`)
  return JSON.parse(readFileSync(statePath(run), "utf8"))
}

const sh = (command, args, cwd, log) => {
  const out = openSync(log, "a")
  try {
    execFileSync(command, args, { cwd, stdio: ["ignore", out, out], env: process.env })
  } catch {
    fail(`${command} ${args.join(" ")} failed in ${cwd}. Read ${log}, then run stop on this run.`)
  } finally {
    closeSync(out)
  }
}

const ours = (state) => commandLine(state.pid).includes(state.persist)

const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const commandLine = (pid) => {
  try {
    return readFileSync(`/proc/${String(pid)}/cmdline`, "utf8").replaceAll("\0", " ")
  } catch {
    return ""
  }
}

async function launch(named) {
  const run = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`
  const scratch = path.join(scratchRoot, run)
  const evidence = path.join(evidenceRoot, run)
  mkdirSync(scratch, { recursive: true })
  mkdirSync(evidence, { recursive: true })
  const log = path.join(scratch, "launch.log")
  const ref = typeof named.ref === "string" ? named.ref : undefined
  const checkout = ref === undefined ? repo : path.join(scratch, "checkout")
  const persist = path.join(scratch, "state")
  writeFileSync(statePath(run), JSON.stringify({ run, checkout, ownCheckout: ref !== undefined, persist, evidence }))
  console.error(`run ${run}`)
  if (ref !== undefined) {
    sh("git", ["worktree", "add", "--detach", checkout, ref], repo, log)
    sh("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], checkout, log)
  }
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: checkout, encoding: "utf8" }).trim()
  if (named["no-build"] !== true) sh("pnpm", ["--filter", "@powerday/chat", "build"], checkout, log)
  sh("node", ["scripts/browser-config.mjs"], checkout, log)
  const chat = path.join(checkout, "apps/chat")
  sh(
    "pnpm",
    ["exec", "wrangler", "d1", "migrations", "apply", "power-chat", "--local", "--persist-to", persist],
    chat,
    log,
  )
  const port = await freePort()
  const origin = `http://127.0.0.1:${String(port)}`
  const out = openSync(path.join(scratch, "serve.log"), "a")
  const child = spawn(
    "pnpm",
    [
      "exec",
      "wrangler",
      "dev",
      "--config",
      "dist/power_chat/browser.wrangler.json",
      "--local",
      "--persist-to",
      persist,
      "--var",
      "LOCAL_AUTH:true",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--inspector-port",
      "0",
      "--infer-origin-from-routes=false",
    ],
    { cwd: chat, detached: true, stdio: ["ignore", out, out] },
  )
  child.unref()
  const state = {
    run,
    origin,
    port,
    pid: child.pid,
    commit,
    ref,
    checkout,
    ownCheckout: ref !== undefined,
    persist,
    evidence,
  }
  writeFileSync(statePath(run), JSON.stringify(state, null, 2))
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const answer = await fetch(origin).catch(() => undefined)
    if (answer?.ok) {
      writeFileSync(statePath(run), JSON.stringify({ ...state, ready: true }, null, 2))
      writeFileSync(path.join(evidence, "proof.md"), `# Run ${run}\n\n- commit ${commit}\n- origin ${origin}\n`)
      return print({ run, origin, commit, evidence })
    }
    if (!alive(child.pid)) break
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  fail(`The stack did not answer. Read ${path.join(scratch, "serve.log")}, then run stop ${run}.`)
}

async function doctor(run) {
  const state = readState(run)
  const answer = await fetch(state.origin).catch(() => undefined)
  const session = await fetch(`${state.origin}/api/auth/get-session`).catch(() => undefined)
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: state.checkout, encoding: "utf8" }).trim()
  const checks = {
    serveOwned: alive(state.pid) && ours(state),
    appServed: answer?.ok === true,
    apiAnswers: session?.ok === true,
    buildIsHead: head === state.commit,
  }
  const ok = Object.values(checks).every(Boolean)
  print({ ok, run, origin: state.origin, checks })
  if (!ok) process.exit(1)
}

function stop(run) {
  const state = readState(run)
  if (state.pid !== undefined && alive(state.pid) && ours(state)) {
    for (const target of [-state.pid, state.pid]) {
      try {
        process.kill(target, "SIGTERM")
        break
      } catch {
        continue
      }
    }
  }
  if (state.ownCheckout && existsSync(state.checkout))
    execFileSync("git", ["worktree", "remove", "--force", state.checkout], { cwd: repo, stdio: "ignore" })
  rmSync(path.join(scratchRoot, run), { recursive: true, force: true })
  appendProof(state, `- stopped; evidence kept`)
  print({ run, stopped: true, evidenceKept: existsSync(state.evidence), evidence: state.evidence })
}

const appendProof = (state, line) => {
  const file = path.join(state.evidence, "proof.md")
  writeFileSync(file, `${existsSync(file) ? readFileSync(file, "utf8") : ""}${line}\n`)
}

const libraries = path.join(homedir(), ".cache/chromium-libs/root/usr/lib/x86_64-linux-gnu")

const loadPlaywright = async () => {
  const { chromium } = await import(path.join(repo, "node_modules/@playwright/test/index.mjs"))
  const given = (process.env.LD_LIBRARY_PATH ?? "").split(":").filter(Boolean)
  const env =
    existsSync(libraries) && !given.includes(libraries)
      ? { ...process.env, LD_LIBRARY_PATH: [libraries, ...given].join(":") }
      : process.env
  return {
    launch: async () => {
      try {
        return await chromium.launch({ env })
      } catch (error) {
        const missing = String(error?.message ?? error).match(/error while loading shared libraries: ([^:\s]+)/)?.[1]
        if (missing)
          fail(`Chromium cannot start: ${missing} is missing. Unpack Chromium's libraries into ${libraries}.`)
        if (/Executable doesn't exist/.test(String(error?.message)))
          fail("Run pnpm exec playwright install chromium once.")
        throw error
      }
    },
  }
}

async function accountState(browser, state, email) {
  const folder = path.join(scratchRoot, state.run, "accounts")
  const file = path.join(folder, `${createHash("sha256").update(email).digest("hex").slice(0, 12)}.json`)
  if (existsSync(file)) return file
  mkdirSync(folder, { recursive: true })
  const address = `10.${String(randomBytes(1)[0])}.${String(randomBytes(1)[0])}.${String(1 + (randomBytes(1)[0] % 250))}`
  const context = await browser.newContext({ baseURL: state.origin, extraHTTPHeaders: { "cf-connecting-ip": address } })
  const issued = await context.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/" } })
  if (!issued.ok()) fail(`Sign-in for ${email} answered ${String(issued.status())}`)
  const rows = JSON.parse(
    execFileSync(
      "pnpm",
      [
        "exec",
        "wrangler",
        "d1",
        "execute",
        "power-chat",
        "--local",
        "--persist-to",
        state.persist,
        "--json",
        "--command",
        `SELECT mail ->> '$.text' AS text FROM mail_log WHERE mail ->> '$.to' = '${email.replaceAll("'", "''")}' ORDER BY id DESC LIMIT 1`,
      ],
      { cwd: path.join(state.checkout, "apps/chat"), encoding: "utf8" },
    ),
  )
  const text = rows?.[0]?.results?.[0]?.text
  const link = typeof text === "string" ? text.split("\n").find((line) => line.startsWith("http")) : undefined
  if (link === undefined) fail(`No sign-in mail for ${email}`)
  const page = await context.newPage()
  await page.goto(link)
  await page.getByRole("button", { name: email }).waitFor({ timeout: 20_000 })
  await context.storageState({ path: file })
  await context.close()
  return file
}

async function openPage(browser, state, { path: where, as, width, height, scheme, click = [], say }) {
  const storageState = as === "nobody" ? undefined : await accountState(browser, state, as ?? defaultAccount)
  const context = await browser.newContext({
    baseURL: state.origin,
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    reducedMotion: "reduce",
    storageState,
  })
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(where)
  await settle(page)
  if (typeof say === "string") {
    const replies = await page.locator(".is-assistant").count()
    await page.getByRole("textbox", { name: "Message" }).fill(say)
    await page.getByRole("textbox", { name: "Message" }).press("Enter")
    await page.locator(".is-assistant").nth(replies).waitFor({ timeout: 30_000 })
    await page.getByRole("button", { name: "Send", exact: true }).waitFor({ timeout: 30_000 })
    await settle(page)
  }
  for (const selector of click) {
    await page.locator(selector).first().click()
    await settle(page)
  }
  return { page, context, errors }
}

async function settle(page) {
  await page.waitForLoadState("load")
  await page
    .waitForFunction(
      () =>
        document.querySelector("#root > *") !== null &&
        document.querySelector('[aria-busy="true"], [data-slot="skeleton"], [aria-label="Loading models"]') === null,
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => {})
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
}

const dataUrl = (buffer) => `data:image/png;base64,${buffer.toString("base64")}`

async function render(browser, articles, file) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await page.setContent(pageHtml(articles, themeCss(repo)))
  await page.evaluate(() => Promise.all([...document.images].map((image) => image.decode())))
  await page.locator("main").screenshot({ path: file })
  await context.close()
  return file
}

const viewOptions = (named) => ({
  as: typeof named.as === "string" ? named.as : undefined,
  width: Number(named.width ?? 1280),
  height: Number(named.height ?? 800),
  scheme: named.scheme === "dark" ? "dark" : "light",
  click: list(named.click),
  say: typeof named.say === "string" ? named.say : undefined,
})

const folderFor = (state, label) => {
  const folder = path.join(state.evidence, `${label}-${String(Date.now())}`)
  mkdirSync(folder, { recursive: true })
  return folder
}

async function look(run, where, named) {
  const state = readState(run)
  if (!where) fail("Name a path, such as / or /screens/01-empty")
  const chromium = await loadPlaywright()
  const browser = await chromium.launch()
  try {
    const options = viewOptions(named)
    const label =
      typeof named.name === "string"
        ? named.name
        : `look${where.replaceAll(/[^a-z0-9]+/gi, "-")}-${String(options.width)}-${options.scheme}`
    const folder = folderFor(state, label)
    const { page, errors } = await openPage(browser, state, { path: where, ...options })
    const shot = await page.screenshot({ path: path.join(folder, "page.png") })
    writeFileSync(path.join(folder, "aria.txt"), await page.locator("body").ariaSnapshot())
    const findings = await page.evaluate(scan)
    writeFileSync(path.join(folder, "findings.json"), JSON.stringify({ errors, findings }, null, 2))
    await render(
      browser,
      [
        blockHtml({
          title: `${where} at ${String(options.width)} in ${options.scheme}: ${String(findings.length)} findings`,
          notes: findings.map((finding) => `${finding.detector}: ${finding.message} (${finding.selector})`),
          sides: [
            {
              label: "",
              image: dataUrl(shot),
              width: options.width,
              height: options.height,
              boxes: findings.map((finding) => finding.box),
              colors: findings.map((finding) => rankColor[finding.rank]),
            },
          ],
        }),
      ],
      path.join(folder, "annotated.png"),
    )
    const counts = Object.fromEntries(
      detectors.map(({ name }) => [name, findings.filter((each) => each.detector === name).length]),
    )
    appendProof(
      state,
      `- look ${where} ${String(options.width)} ${options.scheme}: ${String(findings.length)} findings, ${String(errors.length)} page errors`,
    )
    print({
      folder,
      findings: findings.length,
      counts,
      pageErrors: errors,
      annotated: path.join(folder, "annotated.png"),
    })
  } finally {
    await browser.close()
  }
}

async function measure(page, target, kind) {
  if (Array.isArray(target)) {
    for (const each of target) {
      const box = await measure(page, each, kind)
      if (box !== null) return box
    }
    return null
  }
  if (typeof target === "object") return target
  const locator = page.locator(target)
  const count = await locator.count()
  for (let index = 0; index < count; index += 1) {
    const box = await locator.nth(index).evaluate((element, wanted) => {
      const shown = element.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true
      if (!shown) return null
      let rect = element.getBoundingClientRect()
      if (wanted === "text") {
        const range = document.createRange()
        range.selectNodeContents(element)
        const text = range.getBoundingClientRect()
        if (text.width > 0 && text.height > 0) rect = text
      }
      if (rect.width === 0 || rect.height === 0) return null
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }, kind)
    if (box !== null) return box
  }
  return null
}

const union = (boxes) => {
  const real = boxes.filter(Boolean)
  if (real.length === 0) return null
  const x = Math.min(...real.map((box) => box.x))
  const y = Math.min(...real.map((box) => box.y))
  return {
    x,
    y,
    width: Math.max(...real.map((box) => box.x + box.width)) - x,
    height: Math.max(...real.map((box) => box.y + box.height)) - y,
  }
}

async function annotate(file, named) {
  if (!file || !existsSync(file)) fail("Pass a callouts file. SKILL.md shows the shape.")
  const blocks = readCallouts(readFileSync(file, "utf8"))
  const runs = [
    ...(typeof named.before === "string" ? [["Before", readState(named.before)]] : []),
    ...(typeof named.after === "string" ? [["After", readState(named.after)]] : []),
  ]
  if (runs.length === 0) fail("Pass --after <run>, and --before <run> for a pair.")
  const out = typeof named.out === "string" ? path.resolve(named.out) : folderFor(runs.at(-1)[1], "annotate")
  mkdirSync(out, { recursive: true })
  const chromium = await loadPlaywright()
  const browser = await chromium.launch()
  const written = []
  const warnings = []
  try {
    for (const [index, block] of blocks.entries()) {
      const opened = []
      for (const [label, state] of runs) opened.push({ label, ...(await openPage(browser, state, block)) })
      const measured = []
      for (const side of opened) {
        const boxes = []
        for (const callout of block.callouts) boxes.push(await measure(side.page, callout.at, callout.target))
        const crop = block.crop === undefined ? null : await measure(side.page, block.crop, "element")
        measured.push({ boxes, crop })
      }
      const cropBox = block.crop === undefined ? null : union(measured.map((each) => each.crop))
      const pad = 24
      const clip =
        cropBox === null
          ? { x: 0, y: 0, width: block.width, height: block.height }
          : {
              x: Math.max(0, cropBox.x - pad),
              y: Math.max(0, cropBox.y - pad),
              width: Math.min(block.width, cropBox.x + cropBox.width + pad) - Math.max(0, cropBox.x - pad),
              height: Math.min(block.height, cropBox.y + cropBox.height + pad) - Math.max(0, cropBox.y - pad),
            }
      const sides = []
      for (const [at, side] of opened.entries()) {
        const shot = await side.page.screenshot({ clip })
        const texts = await side.page.evaluate((area) => {
          const boxes = []
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const holder = node.parentElement
            if (node.textContent.trim() === "" || !holder?.checkVisibility()) continue
            const shown = holder.getBoundingClientRect()
            if (shown.width <= 1 || shown.height <= 1 || getComputedStyle(holder).clipPath === "inset(50%)") continue
            const range = document.createRange()
            range.selectNodeContents(node)
            for (const rect of range.getClientRects())
              if (rect.width > 0 && rect.height > 0)
                boxes.push({ x: rect.x - area.x, y: rect.y - area.y, width: rect.width, height: rect.height })
          }
          for (const field of document.querySelectorAll("input, textarea")) {
            const rect = field.getBoundingClientRect()
            if (field.checkVisibility() && rect.width > 0)
              boxes.push({ x: rect.x - area.x, y: rect.y - area.y, width: rect.width, height: rect.height })
          }
          for (const icon of document.querySelectorAll("svg, img")) {
            const rect = icon.getBoundingClientRect()
            if (icon.checkVisibility() && rect.width > 0 && rect.width <= 64 && rect.height <= 64)
              boxes.push({ x: rect.x - area.x, y: rect.y - area.y, width: rect.width, height: rect.height })
          }
          return boxes
        }, clip)
        const boxes = measured[at].boxes.map((box, which) => {
          if (box === null) {
            warnings.push(`${block.title}: callout ${String(which + 1)} not found on ${side.label}`)
            return null
          }
          const moved = { x: box.x - clip.x, y: box.y - clip.y, width: box.width, height: box.height }
          if (moved.x < 0 || moved.y < 0 || moved.x + moved.width > clip.width || moved.y + moved.height > clip.height)
            warnings.push(`${block.title}: callout ${String(which + 1)} is outside the crop on ${side.label}`)
          return moved
        })
        sides.push({ label: side.label, image: dataUrl(shot), width: clip.width, height: clip.height, boxes, texts })
        if (side.errors.length > 0)
          warnings.push(`${block.title}: ${side.label} page errors: ${side.errors.join("; ")}`)
        await side.context.close()
      }
      const target = path.join(out, `annotated-${String(index + 1)}.png`)
      await render(
        browser,
        [blockHtml({ title: block.title, notes: block.callouts.map((each) => each.note), sides })],
        target,
      )
      written.push({ file: target, title: block.title, notes: block.callouts.map((each) => each.note) })
    }
  } finally {
    await browser.close()
  }
  const markdown = written
    .map(
      (each) =>
        `### ${each.title}\n\n![${each.title}](${path.basename(each.file)})\n\n${each.notes.map((note, at) => `${String(at + 1)}. ${note}`).join("\n")}\n`,
    )
    .join("\n")
  writeFileSync(path.join(out, "before-after.md"), markdown)
  for (const [, state] of runs)
    appendProof(state, `- annotate ${path.basename(file)}: ${String(written.length)} images in ${out}`)
  print({ out, images: written.map((each) => each.file), warnings })
}

async function beside(run, where, named) {
  const state = readState(run)
  const reference = typeof named.reference === "string" ? path.resolve(named.reference) : undefined
  if (!where || reference === undefined || !existsSync(reference))
    fail("beside <run> <path> --reference <png> [--scale n]")
  const scale = Number(named.scale ?? 1)
  const regions = typeof named.regions === "string" ? JSON.parse(readFileSync(named.regions, "utf8")) : []
  const chromium = await loadPlaywright()
  const browser = await chromium.launch()
  try {
    const probe = await browser.newPage()
    const size = await probe.evaluate(
      async (url) => {
        const image = new Image()
        image.src = url
        await image.decode()
        return { width: image.naturalWidth, height: image.naturalHeight }
      },
      dataUrl(readFileSync(reference)),
    )
    await probe.close()
    const width = Math.round(size.width / scale)
    const height = Math.round(size.height / scale)
    const options = { ...viewOptions(named), width, height }
    const folder = folderFor(state, `beside${where.replaceAll(/[^a-z0-9]+/gi, "-")}`)
    const { page, context } = await openPage(browser, state, { path: where, ...options })
    const shot = await page.screenshot({ path: path.join(folder, "build.png") })
    const built = []
    for (const region of regions) built.push(await measure(page, region.selector, region.target ?? "element"))
    await context.close()
    const referenceBoxes = regions.map((region) =>
      region.reference
        ? {
            x: region.reference.x / scale,
            y: region.reference.y / scale,
            width: region.reference.width / scale,
            height: region.reference.height / scale,
          }
        : null,
    )
    const round = (value) => (value === undefined ? "" : String(Math.round(value)))
    const rows = regions.map((region, index) => {
      const want = referenceBoxes[index]
      const got = built[index]
      return {
        region: region.name,
        "reference x,y w×h": want ? `${round(want.x)},${round(want.y)} ${round(want.width)}×${round(want.height)}` : "",
        "build x,y w×h": got ? `${round(got.x)},${round(got.y)} ${round(got.width)}×${round(got.height)}` : "missing",
        Δw: want && got ? round(got.width - want.width) : "",
        Δh: want && got ? round(got.height - want.height) : "",
        Δx: want && got ? round(got.x - want.x) : "",
        Δy: want && got ? round(got.y - want.y) : "",
      }
    })
    writeFileSync(
      path.join(folder, "beside.json"),
      JSON.stringify({ scale, viewport: { width, height }, rows }, null, 2),
    )
    const target = path.join(folder, "beside.png")
    await render(
      browser,
      [
        blockHtml({
          title: `${where} beside the reference at ${String(width)}×${String(height)} CSS px (reference scale ${String(scale)})`,
          notes: regions.map((region) => region.name),
          sides: [
            { label: "Reference", image: dataUrl(readFileSync(reference)), width, height, boxes: referenceBoxes },
            { label: "Build", image: dataUrl(shot), width, height, boxes: built },
          ],
          table: tableHtml(rows),
        }),
      ],
      target,
    )
    appendProof(state, `- beside ${where} against ${path.basename(reference)} at ${String(width)}×${String(height)}`)
    print({ folder, beside: target, viewport: { width, height }, rows })
  } finally {
    await browser.close()
  }
}

function publish(folder, named) {
  const pr = named.pr
  if (!folder || !existsSync(folder) || typeof pr !== "string") fail("publish <folder> --pr <number>")
  const files = execFileSync("find", [folder, "-maxdepth", "1", "-name", "*.png"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .sort()
  const exists = (() => {
    try {
      execFileSync("gh", ["release", "view", "proof"], { cwd: repo, stdio: "ignore" })
      return true
    } catch {
      return false
    }
  })()
  if (!exists)
    execFileSync(
      "gh",
      [
        "release",
        "create",
        "proof",
        "--prerelease",
        "--title",
        "proof",
        "--notes",
        "Screenshots for pull request proof.",
      ],
      {
        cwd: repo,
        stdio: "ignore",
      },
    )
  const slug = execFileSync("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
    cwd: repo,
    encoding: "utf8",
  }).trim()
  const links = files.map((file) => {
    const bytes = readFileSync(file)
    const name = `pr-${pr}-${path.basename(file, ".png")}-${createHash("sha256").update(bytes).digest("hex").slice(0, 10)}.png`
    const staged = path.join(scratchRoot, name)
    mkdirSync(scratchRoot, { recursive: true })
    writeFileSync(staged, bytes)
    execFileSync("gh", ["release", "upload", "proof", staged, "--clobber"], { cwd: repo, stdio: "ignore" })
    rmSync(staged)
    return { file, url: `https://github.com/${slug}/releases/download/proof/${name}` }
  })
  const markdown = path.join(folder, "before-after.md")
  if (existsSync(markdown)) {
    let text = readFileSync(markdown, "utf8")
    for (const link of links) text = text.replaceAll(`](${path.basename(link.file)})`, `](${link.url})`)
    writeFileSync(path.join(folder, "before-after.published.md"), text)
  }
  print({ links })
}

const usage = `verify-power-chat <command>
  launch [--ref <commit>] [--no-build]          start a private Power Chat stack
  doctor <run>                                    check the stack is ours and answers
  look <run> <path> [view]                        screenshot, ARIA snapshot, ranked findings, annotated.png
  beside <run> <path> --reference <png> [--scale n] [--regions file] [view]
  annotate <callouts.json> --after <run> [--before <run>] [--out dir]
  publish <folder> --pr <number>                  upload PNGs to the proof release, print links
  stop <run>
view: --as <email|nobody> --width n --height n --scheme light|dark --say <text> --click <selector> (repeatable)`

const [command, ...rest] = process.argv.slice(2)
const { named, plain } = flags(rest)
if (command === "launch") await launch(named)
else if (command === "doctor") await doctor(plain[0])
else if (command === "stop") stop(plain[0])
else if (command === "look") await look(plain[0], plain[1], named)
else if (command === "beside") await beside(plain[0], plain[1], named)
else if (command === "annotate") await annotate(plain[0], named)
else if (command === "publish") publish(plain[0], named)
else {
  console.log(usage)
  if (command !== undefined) process.exit(1)
}
