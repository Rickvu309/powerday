import { execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  const bytes = randomBytes(3)
  await page
    .context()
    .setExtraHTTPHeaders({ "cf-connecting-ip": `198.${18 + ((bytes[0] ?? 0) % 2)}.${bytes[1]}.${bytes[2]}` })
})

const chat = path.join(import.meta.dirname, "../../apps/chat")
const proof = "tests/browser/sign-in-code-proof"

test("pasting a spaced code auto-submits and signs in against local D1", async ({ page }) => {
  const email = `code-${randomBytes(4).toString("hex")}@example.com`
  await page.goto("/")
  await page.getByLabel("Email", { exact: true }).fill(email)
  await page.getByRole("button", { name: "Continue with email" }).click()
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeFocused()
  await page.keyboard.press("Tab")
  const input = page.getByLabel("Sign-in code", { exact: true })
  await expect(input).toBeFocused()
  await expect(input).toHaveAttribute("inputmode", "numeric")
  await expect(input).toHaveAttribute("autocomplete", "one-time-code")
  const result = JSON.parse(
    execFileSync(
      "pnpm",
      [
        "exec",
        "wrangler",
        "d1",
        "execute",
        "power-chat",
        "--local",
        "--json",
        "--command",
        `SELECT mail ->> '$.subject' AS subject FROM mail_log WHERE mail ->> '$.to' = '${email}' ORDER BY id DESC LIMIT 1`,
      ],
      { cwd: chat, encoding: "utf8", stdio: "pipe" },
    ),
  )
  const code = String(result[0].results[0].subject).slice(0, 6)
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
  await page.evaluate((value) => navigator.clipboard.writeText(value), `${code.slice(0, 3)} ${code.slice(3)}`)
  await input.press("ControlOrMeta+V")
  await expect(page.getByRole("button", { name: email })).toBeVisible()
})

for (const [code, attemptsLeft, message] of [
  ["INVALID_OTP", 4, "That code isn't right. 4 attempts left."],
  ["OTP_EXPIRED", 0, "That code expired or was already used. Send a new code."],
  ["TOO_MANY_ATTEMPTS", 0, "Too many attempts. Send a new code to sign in."],
] as const) {
  test(`${code} offers a new code with the existing cooldown`, async ({ page }) => {
    await page.clock.install()
    await page.route("**/api/auth/sign-in/magic-link", (route) => route.fulfill({ json: {} }))
    let attempts = 0
    await page.route("**/api/auth/sign-in/email-otp", (route) => {
      attempts += 1
      return route.fulfill({ status: 400, json: { code, attemptsLeft } })
    })
    await page.goto("/")
    await page.getByLabel("Email", { exact: true }).fill("ada@example.com")
    await page.getByRole("button", { name: "Continue with email" }).click()
    await page.getByLabel("Sign-in code", { exact: true }).fill("123 456")
    await expect(page.getByText(message, { exact: true })).toBeVisible()
    expect(attempts).toBe(1)
    await expect(page.getByRole("button", { name: "Send a new code in 30s" })).toBeDisabled()
    await page.clock.fastForward(30_000)
    await page.getByRole("button", { name: "Send a new code", exact: true }).click()
    await expect(page.getByLabel("Sign-in code", { exact: true })).toBeEditable()
    await expect(page.getByText(message, { exact: true })).toHaveCount(0)
  })
}

for (const width of [375, 1440]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`capture sign-in code and email proof at ${width} ${colorScheme}`, async ({ page }) => {
      mkdirSync(proof, { recursive: true })
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" })
      await page.setContent('<pre style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>')
      await page.locator("pre").evaluate((element) => {
        element.textContent =
          "Open this link to sign in to Power Chat:\n\nhttps://chat.example.com/api/auth/magic-link/verify?token=example\n\nThe link works once and expires in 10 minutes.\nIf you did not ask to sign in, ignore this email."
      })
      await page.screenshot({ path: `${proof}/before-email-${width}-${colorScheme}.png`, fullPage: true })
      for (const screen of [
        "03-sign-in-sent",
        "85-code-wrong",
        "86-code-expired",
        "87-code-locked",
        "88-code-verifying",
        "89-code-failed",
        "90-sign-in-email",
      ]) {
        await page.goto(`/screens/${screen}`)
        await page.evaluate(() => document.fonts.ready)
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
        await page.screenshot({ path: `${proof}/${screen}-${width}-${colorScheme}.png`, fullPage: true })
      }
      const email = page.frameLocator('iframe[title="Sign-in email HTML"]')
      await expect(email.getByRole("link", { name: "Sign in to Power Chat", exact: true })).toBeVisible()
      expect(await email.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth)).toBe(true)
    })
  }
}

test("rate limits let people retry sending and entering a code", async ({ page }) => {
  let limited = true
  await page.route("**/api/auth/sign-in/magic-link", (route) =>
    route.fulfill({ status: limited ? 429 : 200, json: {} }),
  )
  await page.route("**/api/auth/sign-in/email-otp", (route) =>
    route.fulfill({ status: 429, body: "Too many requests" }),
  )
  await page.goto("/")
  await page.getByLabel("Email", { exact: true }).fill("limited@example.com")
  await page.getByRole("button", { name: "Continue with email" }).click()
  const message = page.getByText("Too many attempts. Wait a minute and try again.", { exact: true })
  await expect(message).toBeVisible()
  limited = false
  await page.getByRole("button", { name: "Continue with email" }).click()
  await page.getByLabel("Sign-in code", { exact: true }).fill("123456")
  await expect(message).toBeVisible()
  await expect(page.getByLabel("Sign-in code", { exact: true })).toBeEditable()
})
