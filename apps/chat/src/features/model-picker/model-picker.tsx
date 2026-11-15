import type { ListedModel } from "@powerday/chat-core"
import { ChevronDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useModels } from "./model-choice"

const capabilityNames: readonly (readonly [keyof ListedModel["capabilities"], string])[] = [
  ["tools", "Tools"],
  ["vision", "Vision"],
  ["reasoning", "Reasoning"],
]

const capabilitiesOf = (model: ListedModel) =>
  capabilityNames
    .filter(([capability]) => model.capabilities[capability])
    .map(([, name]) => name)
    .join(" · ")

export function ModelPicker() {
  const { models, choose } = useModels()
  if (models.state === "loading") return <Skeleton aria-label="Loading models" className="mx-2 h-5 w-24" />
  if (models.state === "failed" || models.chosen === undefined) {
    return <span className="px-2.5 text-sm text-muted-foreground">No models available</span>
  }
  const { chosen } = models
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="gap-1 px-2.5 text-base font-medium"
            aria-label={`Model: ${chosen.label}`}
          />
        }
      >
        {chosen.label}
        <ChevronDownIcon className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <DropdownMenuRadioGroup
          value={chosen.id}
          onValueChange={(value) => {
            const picked = models.models.find((model) => model.id === value)
            if (picked !== undefined) choose(picked.id)
          }}
        >
          <DropdownMenuLabel>Model</DropdownMenuLabel>
          {models.models.map((model) => {
            const capabilities = capabilitiesOf(model)
            return (
              <DropdownMenuRadioItem key={model.id} value={model.id} closeOnClick className="py-2">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate">{model.label}</span>
                  {capabilities === "" ? null : (
                    <span className="truncate text-xs text-muted-foreground">{capabilities}</span>
                  )}
                </span>
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
