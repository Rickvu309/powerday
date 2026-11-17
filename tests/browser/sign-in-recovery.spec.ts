import { expect, test } from "@playwright/test"

for (const method of ["email", "google"] as const) {
  test(`${method} keeps its invoked control focusable and prevents duplicate submission`, async ({ page }) => {
    await page.route("**/api/auth/get-session", (route) => route.fulfill({ json: null }))
    await page.route("**/api/auth/methods", (route) => route.fulfill({ json: { methods: ["email", "google"] } }))
    const held = Promise.withResolvers<void>()
    let calls = 0
    await page.route(`**/api/auth/sign-in/${method === "email" ? "magic-link" : "social"}`, async (route) => {
      calls += 1
      await held.promise
      await route.fulfill({ status: method === "email" ? 200 : 503, json: {} })
    })
    await page.goto("/")
    await page.getByLabel("Email", { exact: true }).fill("ada@example.com")
    const invoked = page.getByRole("button", {
      name: method === "email" ? "Continue with email" : "Continue with Google",
    })
    await invoked.focus()
    await page.keyboard.press("Enter")
    const pending = page.getByRole("button", { name: method === "email" ? "Sending link…" : "Connecting to Google…" })
    await expect(pending).toBeFocused()
    expect(await pending.evaluate((element) => element.hasAttribute("disabled"))).toBe(false)
    await expect(pending).toHaveAttribute("aria-disabled", "true")
    await page.keyboard.press("Enter")
    expect(calls).toBe(1)
    held.resolve()
    if (method === "email") {
      await expect(page.getByRole("heading", { name: "Check your email" })).toBeFocused()
      await expect(page.getByRole("status")).toBeEmpty()
    } else await expect(page.getByRole("alert")).toHaveText("Sign-in didn't finish. Try again.")
  })
}

test("resend retains the address, counts down quietly and recovers from failure", async ({ page }) => {
  await page.clock.install()
  await page.route("**/api/auth/get-session", (route) => route.fulfill({ json: null }))
  await page.route("**/api/auth/methods", (route) => route.fulfill({ json: { methods: ["email"] } }))
  let calls = 0
  const held = Promise.withResolvers<void>()
  await page.route("**/api/auth/sign-in/magic-link", async (route) => {
    expect(route.request().postDataJSON().email).toBe("ada@example.com")
    calls += 1
    if (calls === 2) await held.promise
    await route.fulfill({ status: calls === 3 ? 503 : 200, json: {} })
  })
  await page.goto("/")
  await page.getByLabel("Email", { exact: true }).fill("ada@example.com")
  await page.getByRole("button", { name: "Continue with email" }).click()
  const cooldown = page.getByRole("button", { name: "Send a new link in 30s" })
  await expect(cooldown).toBeDisabled()
  await expect(cooldown).toHaveCSS("font-variant-numeric", "tabular-nums")
  await expect(page.getByRole("status")).toBeEmpty()
  await page.clock.fastForward(30_000)
  await expect(page.getByRole("status")).toHaveText("Send a new link")
  await page.getByRole("button", { name: "Send a new link", exact: true }).click()
  await expect(page.getByRole("button", { name: "Sending a new link…" })).toBeFocused()
  held.resolve()
  await expect(page.getByRole("status")).toHaveText("New link sent")
  await expect(page.getByRole("button", { name: "Send a new link in 30s" })).toBeDisabled()
  await page.clock.fastForward(30_000)
  await page.getByRole("button", { name: "Send a new link", exact: true }).click()
  await expect(page.getByRole("status")).toHaveText("We couldn't send the link. Check your connection and try again.")
  const afterFailure = page.getByRole("button", { name: "Send a new link in 30s" })
  await expect(afterFailure).toBeDisabled()
  await afterFailure.click({ force: true })
  expect(calls).toBe(3)
  await page.clock.fastForward(30_000)
  await page.getByRole("button", { name: "Send a new link", exact: true }).click()
  await expect(page.getByRole("status")).toHaveText("New link sent")
  expect(calls).toBe(4)
})

test("using a different email keeps the cooldown for the address that was just sent", async ({ page }) => {
  await page.clock.install()
  await page.route("**/api/auth/get-session", (route) => route.fulfill({ json: null }))
  await page.route("**/api/auth/methods", (route) => route.fulfill({ json: { methods: ["email"] } }))
  const sentTo: string[] = []
  await page.route("**/api/auth/sign-in/magic-link", (route) => {
    sentTo.push(route.request().postDataJSON().email)
    return route.fulfill({ json: {} })
  })
  await page.goto("/")
  const email = page.getByLabel("Email", { exact: true })
  await email.fill("ada@example.com")
  await page.getByRole("button", { name: "Continue with email" }).click()
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible()
  await page.clock.fastForward(10_000)
  await page.getByRole("button", { name: "Use a different email" }).click()
  await email.fill("ada@example.com")
  await page.getByRole("button", { name: "Continue with email" }).click()
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible()
  await expect(page.getByRole("button", { name: /^Send a new link in (19|20)s$/ })).toBeDisabled()
  expect(sentTo).toEqual(["ada@example.com"])
  await page.getByRole("button", { name: "Use a different email" }).click()
  await email.fill("grace@example.com")
  await page.getByRole("button", { name: "Continue with email" }).click()
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible()
  expect(sentTo).toEqual(["ada@example.com", "grace@example.com"])
})

test("a long email remains fully readable at 200% text size", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await page.route("**/api/auth/get-session", (route) => route.fulfill({ json: null }))
  await page.route("**/api/auth/methods", (route) => route.fulfill({ json: { methods: ["email"] } }))
  await page.route("**/api/auth/sign-in/magic-link", (route) => route.fulfill({ json: {} }))
  await page.goto("/")
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%"
  })
  const email = "bartholomew.fitzgerald@northwind-industries-holdings.example.com"
  await page.getByLabel("Email", { exact: true }).fill(email)
  await page.getByRole("button", { name: "Continue with email" }).click()
  await expect(page.getByText(email, { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
})

for (const failure of ["invalid", "refused", "expired"] as const) {
  test(`${failure} sign-in offers recovery`, async ({ page }) => {
    await page.route("**/api/auth/get-session", (route) => route.fulfill({ json: null }))
    await page.route("**/api/auth/methods", (route) => route.fulfill({ json: { methods: ["email"] } }))
    let calls = 0
    await page.route("**/api/auth/sign-in/magic-link", (route) => {
      calls += 1
      return route.fulfill({ status: 403, json: {} })
    })
    await page.goto(failure === "expired" ? "/?error=INVALID_TOKEN" : "/")
    if (failure === "expired") {
      await expect(page.getByRole("alert")).toContainText("expired or was already used")
      return
    }
    await page.getByLabel("Email", { exact: true }).fill(failure === "invalid" ? "invalid" : "ada@example.com")
    await page.getByRole("button", { name: "Continue with email" }).click()
    if (failure === "invalid") {
      expect(calls).toBe(0)
      await expect(page.getByLabel("Email", { exact: true })).toBeFocused()
    } else {
      await expect(page.getByRole("alert")).toContainText("Use an invited email address")
      await expect(page.getByLabel("Email", { exact: true })).toBeFocused()
    }
  })
}

for (const width of [1440, 375]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`resend proof at ${width} in ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" })
      for (const screen of [
        "03-sign-in-sent",
        "80-google-connecting",
        "81-resend-ready",
        "82-resending",
        "83-resent",
        "84-resend-failed",
      ]) {
        await page.goto(`/screens/${screen}`)
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({
          path: `tests/browser/sign-in-recovery-proof/${screen}-${width}-${colorScheme}.png`,
          fullPage: true,
        })
      }
    })
  }
}

for (const interaction of ["pointer", "keyboard", "reduce"] as const) {
  test(`${interaction} success uses the expected motion policy`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: interaction === "reduce" ? "reduce" : "no-preference" })
    await page.route("**/api/auth/get-session", (route) => route.fulfill({ json: null }))
    await page.route("**/api/auth/methods", (route) => route.fulfill({ json: { methods: ["email"] } }))
    await page.route("**/api/auth/sign-in/magic-link", (route) => route.fulfill({ json: {} }))
    await page.goto("/")
    await page.getByLabel("Email", { exact: true }).fill("ada@example.com")
    const submit = page.getByRole("button", { name: "Continue with email" })
    if (interaction === "keyboard") {
      await submit.focus()
      await page.keyboard.press("Enter")
    } else await submit.click()
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeFocused()
    await expect(page.locator(".auth-success")).toHaveCSS(
      "transition-duration",
      interaction === "pointer" ? "0.15s" : "0s",
    )
    if (interaction === "reduce") expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
  })
}
