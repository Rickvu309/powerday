import { useId, type ComponentProps } from "react"
import { Input } from "@/components/ui/input"

export function Field({ label, ...props }: ComponentProps<typeof Input> & { label: string }) {
  const id = useId()
  return (
    <label htmlFor={id} className="grid min-w-0 gap-2 text-sm font-medium [overflow-wrap:anywhere]">
      {label}
      <Input id={id} className="min-w-0 max-w-full text-base sm:text-sm" {...props} />
    </label>
  )
}
