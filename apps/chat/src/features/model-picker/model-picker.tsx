import { ChevronDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { showComingSoon } from "@/features/toast/coming-soon"
import { useModels } from "./model-choice"

const stops = ["Fast", "Think", "Ultra"] as const

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
    if (next === 2) return showComingSoon("Ultra")
    const model = next === 1 ? think : fast
    if (model === undefined) return showComingSoon(stops[next] ?? "Think")
    choose(model.id)
  }
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            className="h-9 max-w-56 min-w-0 shrink gap-1 rounded-full px-3 text-base font-normal text-muted-foreground hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground"
            aria-label={`Model: ${chosen.label} (${name})`}
          />
        }
      >
        <span className="min-w-0 truncate">{name}</span>
        <ChevronDownIcon className="shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 gap-3 rounded-3xl p-4 shadow-lg">
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
            type="range"
            min={0}
            max={2}
            step={1}
            value={level}
            aria-label="Thinking effort"
            aria-valuetext={name}
            onChange={(event) => pick(Number(event.currentTarget.value))}
            className="relative block h-7 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none! [&::-moz-range-thumb]:size-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-border [&::-moz-range-thumb]:bg-card [&::-webkit-slider-thumb]:size-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-border [&::-webkit-slider-thumb]:bg-card [&::-webkit-slider-thumb]:shadow-sm [&:focus-visible::-webkit-slider-thumb]:ring-4 [&:focus-visible::-webkit-slider-thumb]:ring-foreground/10"
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
