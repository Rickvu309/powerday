import { describe, expect, it } from "vitest"
import { signInMail } from "./sign-in-mail.js"
import { emailTheme } from "./email-theme-art.js"

const url = "https://chat.example.com/api/auth/magic-link/verify?token=123456&email=ada%40example.com"

it("carries the code, link, address, expiry and ignore instruction in both alternatives", () => {
  const mail = signInMail("ada@example.com", url, "123456")
  expect(mail.subject).toBe("123456 is your Power Chat sign-in code")
  for (const part of [mail.html, mail.text]) {
    expect(part).toContain("123456")
    expect(part).toContain("ada@example.com")
    expect(part).toContain("10 minutes")
    expect(part).toContain("If you didn't ask to sign in, you can ignore this email.")
    expect(part.match(/https?:[^\s"<>]+/g)?.every((link) => link.startsWith("https://chat.example.com/"))).toBe(true)
  }
  expect(mail.text).toContain(url)
  expect(mail.html).toContain('name="color-scheme"')
  expect(mail.html).not.toMatch(/<img|<script|<link|@import/)
  expect(mail.html).toContain('role="presentation"')
})

it("escapes addresses and link attributes", () => {
  const mail = signInMail('<ada&"@example.com>', 'https://chat.example.com/?q="<&', "012345")
  expect(mail.html).not.toContain('<ada&"')
  expect(mail.html).toContain("&#60;ada&#38;&#34;@example.com&#62;")
  expect(mail.html).toContain('href="https://chat.example.com/?q=&#34;&#60;&#38;"')
})

const luminance = (hex: string) => {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return channels.reduce((total, value, index) => total + value * ([0.2126, 0.7152, 0.0722][index] ?? 0), 0)
}

export const emailContrast = (foreground: string, background: string) => {
  const values = [luminance(foreground), luminance(background)]
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05)
}

describe("email text contrast meets WCAG AA", () => {
  const t = emailTheme
  for (const [name, foreground, background] of [
    ["body", t.foreground, t.background],
    ["secondary", t.muted, t.background],
    ["code", t.foreground, t.surface],
    ["button", t.onPrimary, t.primary],
    ["dark body", t.darkForeground, t.darkBackground],
    ["dark secondary", t.darkMuted, t.darkBackground],
    ["dark code", t.darkForeground, t.darkSurface],
    ["dark button", t.darkBackground, t.darkPrimary],
  ]) {
    it(`${name}: ${emailContrast(foreground ?? "", background ?? "").toFixed(2)}:1`, () => {
      expect(emailContrast(foreground ?? "", background ?? "")).toBeGreaterThanOrEqual(4.5)
    })
  }
})
