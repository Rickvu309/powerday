import { CodeIcon, LightbulbIcon, MapIcon, PenLineIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

const suggestions = [
  {
    label: "Explain a concept",
    icon: LightbulbIcon,
    prompt: "Explain how a refrigerator keeps food cold, in plain words.",
  },
  {
    label: "Write a message",
    icon: PenLineIcon,
    prompt: "Help me write a short, friendly note asking my team to move Friday's meeting.",
  },
  { label: "Plan a weekend", icon: MapIcon, prompt: "Plan a relaxed two-day weekend in a city I've never visited." },
  {
    label: "Write code",
    icon: CodeIcon,
    prompt: "Write a TypeScript function that groups an array of objects by a key.",
  },
]

export function Suggestions({ ready, onPick }: { ready: boolean; onPick: (prompt: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
      <h1 className="text-center text-3xl font-medium text-balance">How can I help you today?</h1>
      <ul className="flex max-w-2xl flex-wrap justify-center gap-2">
        {suggestions.map(({ label, icon: Icon, prompt }) => (
          <li key={label}>
            <Button
              variant="outline"
              className="h-9 rounded-full px-3.5 text-muted-foreground hover:text-foreground"
              disabled={!ready}
              onClick={() => onPick(prompt)}
            >
              <Icon />
              {label}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
