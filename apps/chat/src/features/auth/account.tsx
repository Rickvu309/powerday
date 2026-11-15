import { CircleUserIcon, LogOutIcon } from "lucide-react"
import { useState } from "react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { signOut, useAccount } from "./session"

export function Account() {
  const account = useAccount()
  const [failed, setFailed] = useState(false)
  if (account.status !== "signed-in") return null
  const leave = async () => {
    if (await signOut()) location.reload()
    else setFailed(true)
  }
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton tooltip={account.email} />}>
            <CircleUserIcon />
            <span className="truncate">{account.email}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top">
            <DropdownMenuItem onClick={() => void leave()}>
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {failed && (
          <p role="alert" className="px-2 text-sm text-destructive">
            Couldn't sign out. Try again.
          </p>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
