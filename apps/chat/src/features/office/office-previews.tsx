import type { ReactNode } from "react"
import { alertRed, Collage, coverCream, todoGreen } from "./office-art"

function Row({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-start gap-1.5">
      <span className="mt-0.5 size-2 shrink-0 rounded-[2px] border border-foreground/30" />
      <span className="text-[7.5px] leading-snug">{children}</span>
    </span>
  )
}

export function GuidePreview() {
  return (
    <span className="flex flex-col gap-1.5 p-2">
      <span className="rounded bg-muted p-1.5 text-[7.5px] leading-snug">
        Pages are a place for you to write, build, and collaborate with Power Chat and your teammates. Use this page as
        your playground to learn the basics — and have fun!
      </span>
      <span className="text-[9px] leading-snug font-semibold">Getting started</span>
      <Row>
        <span className="font-semibold">Play with this page.</span> Type{" "}
        <code className="rounded bg-accent px-1 font-mono">/</code> to add headings, images, checklists, tables, and
        more. Try it out in the empty space below 👇
      </Row>
      <Row>
        <span className="font-semibold">Work with Power Chat.</span> Type{" "}
        <code className="rounded bg-accent px-1 font-mono">@Power Chat</code>
        {", followed by your request, and Power Chat will jump in to help with whatever you need."}
      </Row>
    </span>
  )
}

const errands = ["Run propulsion test", "Verify course calculations", "Inspect fuel tanks"]

export function TodoPreview() {
  return (
    <span className="flex flex-col gap-1.5 p-2">
      <span className="text-[9px] leading-snug font-semibold">Today</span>
      <span className="text-[7.5px] leading-snug text-muted-foreground">Top priorities</span>
      {errands.map((errand) => (
        <span key={errand} className="flex items-start gap-1.5">
          <span
            className="mt-0.5 size-2 shrink-0 rounded-[2px] border"
            style={{ borderColor: todoGreen }}
            aria-hidden
          />
          <span className="text-[7.5px] leading-snug">{errand}</span>
        </span>
      ))}
    </span>
  )
}

export function TrackerPreview() {
  return (
    <span className="flex flex-col gap-1.5 p-2">
      <span className="flex items-center gap-1.5">
        <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: alertRed }} aria-hidden />
        <span className="text-[7.5px] leading-snug">Needs immediate attention</span>
      </span>
      <span className="text-[7.5px] leading-snug">Communication systems test for launch</span>
      <span className="mt-1 text-[9px] leading-snug font-semibold">⛰️ Milestones</span>
    </span>
  )
}

export function TravelPreview() {
  return (
    <span className="flex flex-col gap-1.5 p-2">
      <span className="text-[8px] leading-snug">Travelers: Maya and Daniel</span>
      <span className="text-[7.5px] leading-snug text-muted-foreground">Pace: One main activity a day</span>
      <span className="mt-1 text-[9px] leading-snug font-semibold">🧭 The plan</span>
      <span className="overflow-hidden text-[7.5px] leading-snug text-clip whitespace-nowrap">
        Plan two nights near the old quarter
      </span>
    </span>
  )
}

export function PhotographyPreview() {
  return (
    <span className="flex h-full w-full flex-col" style={{ backgroundColor: coverCream }}>
      <span className="flex flex-1 flex-col items-center justify-center gap-0.5 px-3 py-3 text-center">
        <span className="font-serif text-xs font-semibold">Luma Studio</span>
        <span className="text-[7.5px] text-muted-foreground">Selected works</span>
      </span>
      <Collage />
    </span>
  )
}
