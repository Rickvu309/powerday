import type { ComponentProps } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/class-names"

export function Message({ from, className, ...props }: ComponentProps<"div"> & { from: "user" | "assistant" }) {
  return (
    <div
      {...props}
      className={cn(
        "group flex w-full min-w-0 flex-col gap-2",
        from === "user" ? "is-user ml-auto" : "is-assistant",
        className,
      )}
    />
  )
}

export function MessageContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn(
        "flex w-fit min-w-0 max-w-full flex-col gap-2 group-[.is-user]:ml-auto group-[.is-user]:bg-secondary text-foreground",
        className,
      )}
    />
  )
}

export function MessageActions({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn("flex items-center gap-1", className)} />
}

export function MessageAction({ label, ...props }: ComponentProps<typeof Button> & { label: string }) {
  return <Button type="button" size="icon-sm" variant="ghost" aria-label={label} {...props} />
}
