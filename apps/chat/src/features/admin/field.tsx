import { useId, type ComponentProps } from "react"
import { Input } from "@/components/ui/input"

export function Field({ label, ...props }: ComponentProps<typeof Input> & { label: string }) {
  const id = useId()
  return (
    <label htmlFor={id} className="grid gap-2 text-sm font-medium">
      {label}
      <Input id={id} className="text-base sm:text-sm" {...props} />
    </label>
  )
}
