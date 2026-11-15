import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { chmod, mkdir, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const version = "1.7.12"
const checksums = {
  "linux-arm64": "325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6",
  "linux-x64": "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8",
}

const platform = `${process.platform}-${process.arch}`
const expected = checksums[platform]
if (expected === undefined) {
  console.error(`actionlint ${version} is pinned for linux-arm64 and linux-x64, not ${platform}`)
  process.exit(1)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const assetArch = process.arch === "x64" ? "amd64" : "arm64"
const asset = `actionlint_${version}_linux_${assetArch}.tar.gz`
const binDir = path.join(root, "node_modules/.cache/actionlint", version, platform)
const bin = path.join(binDir, "actionlint")

if (!existsSync(bin)) {
  const response = await fetch(`https://github.com/rhysd/actionlint/releases/download/v${version}/${asset}`)
  if (!response.ok) {
    console.error(`failed to download actionlint ${version}: ${response.status}`)
    process.exit(1)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  const hash = createHash("sha256").update(bytes).digest("hex")
  if (hash !== expected) {
    console.error("actionlint checksum mismatch")
    process.exit(1)
  }
  await mkdir(binDir, { recursive: true })
  const archive = path.join(binDir, asset)
  await writeFile(archive, bytes)
  const extracted = spawnSync("tar", ["-xzf", archive, "-C", binDir, "actionlint"], { encoding: "utf8" })
  if (extracted.status !== 0) {
    console.error(extracted.stderr)
    process.exit(extracted.status ?? 1)
  }
  await chmod(bin, 0o755)
}

const result = spawnSync(bin, ["-color=false"], { cwd: root, encoding: "utf8" })
if (result.stdout) {
  process.stdout.write(result.stdout)
}
if (result.stderr) {
  process.stderr.write(result.stderr)
}
process.exit(result.status ?? 1)
