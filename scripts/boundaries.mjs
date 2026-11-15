import fs from "node:fs"
import { builtinModules } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const core = "packages/chat-core"

const builtins = new Set(builtinModules)
const specifiers = /\bfrom\s+["']([^"']+)["']|\bimport\s*(?:\(\s*)?["']([^"']+)["']/g
const ambient = [
  ["Date.now()", /\bDate\.now\(/],
  ["new Date()", /\bnew Date\(\)/],
  ["Math.random()", /\bMath\.random\(/],
  ["crypto.randomUUID()", /\bcrypto\.randomUUID\(/],
]

const runtimeSpecific = (specifier) =>
  /^(?:node|cloudflare):/.test(specifier) ||
  /^(?:@cloudflare\/|wrangler(?:\/|$))/.test(specifier) ||
  builtins.has(specifier.split("/")[0])

export const sourceFindings = (filename, source) => {
  const findings = [...source.matchAll(specifiers)]
    .map((match) => match[1] ?? match[2])
    .filter(runtimeSpecific)
    .map((specifier) => `${filename}: imports ${specifier}. The chat core runs on Node and Workers alike.`)
  if (!/\.test\.[cm]?tsx?$/.test(filename)) {
    for (const [name] of ambient.filter(([, pattern]) => pattern.test(source))) {
      findings.push(`${filename}: calls ${name}. Take the Clock or Ids from the deps instead.`)
    }
  }
  return findings
}

export const tsconfigFindings = (filename, tsconfig) => {
  const options = tsconfig.compilerOptions ?? {}
  const findings = []
  if ((options.lib ?? []).some((lib) => lib.toLowerCase().startsWith("dom"))) {
    findings.push(`${filename}: lib names the DOM, so DOM globals would typecheck in the chat core.`)
  }
  if (!Array.isArray(options.types) || options.types.length > 0) {
    findings.push(`${filename}: set "types": [] so Node and Workers globals do not typecheck in the chat core.`)
  }
  return findings
}

const sources = (folder) =>
  fs
    .readdirSync(folder, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const tsconfig = `${core}/tsconfig.json`
  const findings = [
    ...tsconfigFindings(tsconfig, JSON.parse(fs.readFileSync(path.join(root, tsconfig), "utf8"))),
    ...sources(path.join(root, core, "src")).flatMap((file) =>
      sourceFindings(path.relative(root, file), fs.readFileSync(file, "utf8")),
    ),
  ]
  for (const finding of findings) console.error(finding)
  if (findings.length > 0) process.exit(1)
}
