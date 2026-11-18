import { LogOutIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { signOut, useAccount } from "./session"

const initialsOf = (email: string) =>
  [...email.replace(/@.*/, "").replace(/[^\p{L}\p{N}]/gu, "")].slice(0, 2).join("").toUpperCase() || "?"

export function Account() {
  const account = useAccount()
  const [failed, setFailed] = useState(false)
  if (account.status !== "signed-in") return null
  const leave = async () => {
    if (await signOut()) location.reload()
    else setFailed(true)
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-lg" aria-label={account.email} className="rounded-full" />}
        >
          <span
            aria-hidden
            className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground"
          >
            {initialsOf(account.email)}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-64 max-w-[calc(100vw-2rem)]">
          <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">{account.email}</p>
          <DropdownMenuItem onClick={() => void leave()}>
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {failed && (
        <p role="alert" className="w-full text-center text-xs text-destructive">
          Couldn't sign out.
        </p>
      )}
    </div>
  )
}
