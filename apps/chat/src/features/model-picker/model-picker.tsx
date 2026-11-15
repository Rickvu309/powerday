import { ChevronDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ModelPicker() {
  return (
    <Button variant="ghost" disabled>
      Model
      <ChevronDownIcon />
    </Button>
  )
}
