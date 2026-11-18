import { ChevronDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { showComingSoon } from "@/features/toast/coming-soon"
import { useModels } from "./model-choice"

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
  const mode = chosen.capabilities.reasoning ? "Think" : "Fast"
  const modes = [
    { name: "Fast", hint: "Quick answers", model: fast },
    { name: "Think", hint: "Reasons before answering", model: think },
  ]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-9 max-w-56 min-w-0 shrink gap-1 rounded-full px-3 text-base font-normal text-muted-foreground hover:text-foreground aria-expanded:text-foreground"
            aria-label={`Model: ${chosen.label} (${mode})`}
          />
        }
      >
        <span className="min-w-0 truncate">{mode}</span>
        <ChevronDownIcon className="shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72 max-w-[calc(100vw-2rem)]">
        <DropdownMenuRadioGroup
          value={chosen.id}
          onValueChange={(value) => {
            const picked = models.models.find((model) => model.id === value)
            if (picked !== undefined) choose(picked.id)
          }}
        >
          <DropdownMenuLabel>Model</DropdownMenuLabel>
          {modes.map(({ name, hint, model }) =>
            model === undefined ? (
              <DropdownMenuItem key={name} className="py-2" onClick={() => showComingSoon(name)}>
                <Mode name={name} detail={`${hint}, coming soon`} />
              </DropdownMenuItem>
            ) : (
              <DropdownMenuRadioItem key={name} value={model.id} closeOnClick className="py-2">
                <Mode name={name} detail={`${hint} with ${model.label}`} />
              </DropdownMenuRadioItem>
            ),
          )}
          <DropdownMenuItem className="py-2" onClick={() => showComingSoon("Ultra")}>
            <Mode name="Ultra" detail="Our strongest model, coming soon" />
          </DropdownMenuItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Mode({ name, detail }: { name: string; detail: string }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span>{name}</span>
      <span className="text-xs whitespace-normal text-muted-foreground [overflow-wrap:anywhere]">{detail}</span>
    </span>
  )
}
