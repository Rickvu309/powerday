import { ChevronDownIcon } from "lucide-react"
import { useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { showComingSoon } from "@/features/toast/coming-soon"
import { useModels } from "./model-choice"

const stops = ["Instant", "Medium", "High", "Extra High", "Pro"] as const

const filled = (index: number) => `calc(0.875rem + (100% - 1.75rem) * ${String(index / (stops.length - 1))})`

export function ModelPicker() {
  const { models, choose, reload } = useModels()
  if (models.state === "loading") return <Skeleton aria-label="Loading models" className="mx-2 h-5 w-20" />
  if (models.state === "failed") {
    return (
      <div className="flex flex-wrap items-center gap-2 px-2.5 text-sm text-muted-foreground">
        <span role="status" tabIndex={0}>
          Couldn’t load models
        </span>
        <Button variant="link" size="sm" className="text-sm" onClick={() => void reload()}>
          Try again
        </Button>
      </div>
    )
  }
  if (models.state === "empty") {
    return (
      <span role="status" tabIndex={0} className="px-2.5 text-sm text-muted-foreground">
        No models available. Ask your administrator to turn one on.
      </span>
    )
  }
  const { chosen } = models
  const fast = models.models.find((model) => !model.capabilities.reasoning) ?? models.models[0]
  const think = models.models.find((model) => model.capabilities.reasoning)
  const level = chosen.capabilities.reasoning ? 1 : 0
  const name = stops[level]
  const pick = (next: number) => {
    const model = next === 0 ? fast : next === 1 ? think : undefined
    if (model === undefined) return showComingSoon(stops[next] ?? "Thinking effort")
    choose(model.id)
  }
  return <EffortPopover name={name} level={level} label={chosen.label} onPick={pick} />
}

function EffortPopover({
  name,
  level,
  label,
  onPick,
}: {
  name: string
  level: number
  label: string
  onPick: (next: number) => void
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const slider = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        popoverTarget={id}
        aria-expanded={open}
        className="h-9 max-w-56 min-w-0 shrink gap-1 rounded-full px-3 text-base font-normal text-muted-foreground hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground"
        aria-label={`Model: ${label} (${name})`}
      >
        <span className="min-w-0 truncate">{open ? "Thinking effort" : name}</span>
        <ChevronDownIcon className="shrink-0 text-muted-foreground" />
      </Button>
      <div
        id={id}
        popover="auto"
        data-slot="popover-content"
        className="fixed inset-auto m-0 w-[min(15rem,calc(100vw-1rem))] flex-col gap-3 rounded-3xl bg-popover p-4 text-popover-foreground shadow-lg ring-1 ring-foreground/10 open:flex"
        onBeforeToggle={(event) => {
          if (event.newState !== "open" || trigger.current === null) return
          const anchor = trigger.current.getBoundingClientRect()
          const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
          const width = Math.min(15 * rem, innerWidth - 16)
          const below = innerHeight - anchor.bottom - 8 >= 8 * rem
          event.currentTarget.style.top = below ? `${String(anchor.bottom + 4)}px` : "auto"
          event.currentTarget.style.bottom = below ? "auto" : `${String(innerHeight - anchor.top + 4)}px`
          event.currentTarget.style.left = `${String(Math.max(8, Math.min(anchor.right - width, innerWidth - width - 8)))}px`
        }}
        onToggle={(event) => {
          const shown = event.newState === "open"
          setOpen(shown)
          if (shown) slider.current?.focus()
        }}
      >
        <p className="text-center text-base font-medium">{name}</p>
        <div className="relative h-7">
          <div
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              background: `linear-gradient(to right, var(--foreground) ${filled(level)}, var(--muted) 0)`,
            }}
          />
          {stops.map((stop, index) => (
            <span
              key={stop}
              aria-hidden
              className={`absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full ${index < level ? "bg-background/60" : "bg-muted-foreground/50"}`}
              style={{ left: filled(index) }}
            />
          ))}
          <input
            ref={slider}
            type="range"
            min={0}
            max={stops.length - 1}
            step={1}
            value={level}
            aria-label="Thinking effort"
            aria-valuetext={name}
            onChange={(event) => onPick(Number(event.currentTarget.value))}
            className="relative block h-7 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none! [&::-moz-range-thumb]:size-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-border [&::-moz-range-thumb]:bg-card [&::-webkit-slider-thumb]:size-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-border [&::-webkit-slider-thumb]:bg-card [&::-webkit-slider-thumb]:shadow-sm [&:focus-visible::-webkit-slider-thumb]:ring-4 [&:focus-visible::-webkit-slider-thumb]:ring-foreground/10"
          />
        </div>
      </div>
    </>
  )
}
