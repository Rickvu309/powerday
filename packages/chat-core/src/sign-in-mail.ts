import type { Mail } from "./auth.js"
import { emailTheme as t } from "./email-theme-art.js"

export const linkMinutes = 10

const escape = (value: string) => value.replace(/[&<>"']/g, (character) => `&#${String(character.charCodeAt(0))};`)

export const signInMail = (to: string, url: string, code: string): Mail & { readonly html: string } => {
  const address = escape(to)
  const link = escape(url)
  const digits = escape(code)
  const expiry = `Your sign-in expires in ${String(linkMinutes)} minutes.`
  const ignore = "If you didn't ask to sign in, you can ignore this email."
  const font = "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
  return {
    to,
    subject: `${code} is your Power Chat sign-in code`,
    text: [
      "Sign in to Power Chat",
      "",
      `Your sign-in code: ${code}`,
      "",
      "Or open this link:",
      url,
      "",
      `Sent to ${to}.`,
      expiry,
      "Use either once to sign in.",
      ignore,
      "",
    ].join("\n"),
    html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>Sign in to Power Chat</title>
<style>@media(prefers-color-scheme:dark){.page{background-color:${t.darkBackground}!important;color:${t.darkForeground}!important}.muted{color:${t.darkMuted}!important}.code{background-color:${t.darkSurface}!important;color:${t.darkForeground}!important}.button{background-color:${t.darkPrimary}!important;color:${t.darkBackground}!important}}</style></head>
<body class="page" style="margin:0;padding:0;background-color:${t.background};color:${t.foreground};font-family:${font};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">Your Power Chat sign-in code is ${digits}. Expires in 10 minutes.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:40px 20px">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px">
<tr><td style="padding:0 0 40px;font-size:18px;font-weight:600;letter-spacing:-0.4px">Power Chat<span style="color:${t.primary}">.</span></td></tr>
<tr><td><h1 style="margin:0 0 16px;font-size:30px;line-height:1.2;font-weight:600;letter-spacing:-0.8px">Sign in to Power Chat</h1>
<p class="muted" style="margin:0 0 28px;color:${t.muted};font-size:16px;line-height:1.6">Sign in with the button below, or enter this code in the window where you started.</p></td></tr>
<tr><td class="code" align="center" style="background-color:${t.surface};border:1px solid ${t.border};border-radius:12px;padding:24px 12px;color:${t.foreground};font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:36px;font-weight:600;letter-spacing:8px;line-height:1.4">${digits}</td></tr>
<tr><td style="padding:28px 0"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td class="button" align="center" bgcolor="${t.primary}" style="border-radius:8px;background-color:${t.primary}"><a class="button" href="${link}" style="background-color:${t.primary};border:1px solid ${t.primary};border-radius:8px;color:${t.onPrimary};display:inline-block;font-family:${font};font-size:16px;font-weight:600;line-height:24px;padding:12px 24px;text-align:center;text-decoration:none;mso-padding-alt:12px 24px;mso-border-alt:12px solid ${t.primary}">Sign in to Power Chat</a></td></tr></table></td></tr>
<tr><td class="muted" style="color:${t.muted};font-size:14px;line-height:1.6"><p style="margin:0 0 12px">Sent to <span style="font-weight:500;overflow-wrap:anywhere">${address}</span>.<br>Your sign-in expires in 10 minutes. Use either once.</p><p style="margin:0 0 28px">${ignore}</p></td></tr>
<tr><td class="muted" style="border-top:1px solid ${t.border};padding-top:20px;color:${t.muted};font-size:12px;line-height:1.6">Button not working? Copy this link into your browser:<br><a href="${link}" style="color:inherit;word-break:break-all">${link}</a></td></tr>
</table></td></tr></table></body></html>`,
  }
}
