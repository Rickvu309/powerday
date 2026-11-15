import { onCi, recordFailure, stages, stagesFor, warnSteps } from "./check.mjs"

const requiredSteps = ["format", "lint", "workflows", "test", "tooling", "typecheck", "build"]
const stageOf = (name) => stages.findIndex((stage) => stage.some(([step]) => step === name))
const everyStep = stages.flatMap((stage) => stage.map(([name]) => name))

const lostSteps = requiredSteps.filter((name) => stageOf(name) === -1)
if (lostSteps.length > 0) throw new Error(`check lost the step ${lostSteps.join(", ")}`)
if (new Set(everyStep).size !== everyStep.length) throw new Error("check names a step twice")

for (const later of ["typecheck", "build"]) {
  if (stageOf("test") >= stageOf(later)) throw new Error(`check runs the unit tests no earlier than ${later}`)
}
if (stageOf("typecheck") === stageOf("build")) {
  throw new Error("astro check and astro build both write .astro, so they cannot share a stage")
}

if (!onCi({ CI: "true" }) || !onCi({ CI: "1" }) || onCi({}) || onCi({ CI: "false" })) {
  throw new Error("CI is not told apart from this machine")
}

const warned = new Set(["new-step"])
const warnFailed = []
if (recordFailure(warnFailed, "new-step", warned) !== "warn") throw new Error("a warn step does not print as a warning")
if (warnFailed.length !== 0) throw new Error("a warn step made check fail")
if (recordFailure(warnFailed, "lint", warned) !== "fail") throw new Error("a step outside warnSteps does not fail")
if (warnFailed.join() !== "lint") throw new Error("a failing step was not recorded")
for (const name of warnSteps) {
  if (!everyStep.includes(name)) throw new Error(`warnSteps names ${name}, which check does not run`)
}
for (const name of requiredSteps) {
  if (warnSteps.has(name)) throw new Error(`${name} already blocks and cannot go back to warnSteps`)
}

const stepsOf = (scope) =>
  Object.fromEntries(
    stagesFor(scope)
      .flat()
      .map(([name, , args]) => [name, args.join(" ")]),
  )
const landing = stepsOf(["apps/landing"])
if (landing.test !== "test:unit apps/landing")
  throw new Error(`a landing-only check tests other workspaces: ${landing.test}`)
if (landing.build !== "-r --if-present --filter ./apps/landing run build") {
  throw new Error(`a landing-only check builds other workspaces: ${landing.build}`)
}
const untouched = stepsOf([])
for (const name of ["test", "typecheck", "build"]) {
  if (name in untouched) throw new Error(`a change to no workspace still runs ${name}`)
}
for (const name of ["format", "lint", "workflows", "tooling"]) {
  if (!(name in untouched)) throw new Error(`a change to no workspace skips ${name}, which every change needs`)
}
