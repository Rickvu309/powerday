export const redact = (value: string, secrets: readonly string[]) => {
  let text = value
  for (const secret of secrets) if (secret.length > 0) text = text.replaceAll(secret, "[redacted]")
  return text.replace(/(?:sk-(?:ant-)?[a-zA-Z0-9_-]+|AIza[a-zA-Z0-9_-]+)/g, "[redacted]")
}

export const errorSummary = (error: unknown, provider: string, model: string, secrets: readonly string[]) => ({
  name: redact(error instanceof Error && /^[a-zA-Z0-9_-]+$/.test(error.name) ? error.name : "UnknownError", secrets),
  status:
    typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode
      : undefined,
  provider: redact(provider, secrets),
  model: redact(model, secrets),
})
