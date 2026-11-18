import { CodeIcon, LightbulbIcon, MapIcon, PenLineIcon } from "lucide-react"
import { cn } from "cn"
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

export function Greeting() {
  return (
    <h1
      data-chat-empty
      className="px-4 pb-6 text-center text-2xl leading-tight font-normal text-balance max-md:my-auto max-md:pb-0"
    >
      How can I help you today?
    </h1>
  )
}

export function Suggestions({
  ready,
  onPick,
  className,
}: {
  ready: boolean
  onPick: (prompt: string) => void
  className?: string
}) {
  return (
    <ul className={cn("mx-auto w-full max-w-3xl flex-wrap gap-1 px-5 pt-3", className)}>
      {suggestions.map(({ label, icon: Icon, prompt }) => (
        <li key={label} className="max-w-full">
          <Button
            variant="ghost"
            className="h-auto min-h-9 max-w-full rounded-full px-3 text-left whitespace-normal text-muted-foreground hover:text-foreground [&_svg]:text-primary"
            disabled={!ready}
            onClick={() => onPick(prompt)}
          >
            <Icon />
            {label}
          </Button>
        </li>
      ))}
    </ul>
  )
}
