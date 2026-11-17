import { enterAdmin, useAdminPage } from "./admin-navigation"
import { useEffect, useState } from "react"
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar"

export function AdminLink() {
  const active = useAdminPage()
  const [admin, setAdmin] = useState(false)
  useEffect(() => {
    let active = true
    void fetch("/api/admin-access")
      .then(async (response) => {
        const result: unknown = await response.json()
        if (active && response.ok && typeof result === "object" && result !== null && "admin" in result)
          setAdmin(result.admin === true)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  return admin ? (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton isActive={active} render={<a href="/admin" onClick={enterAdmin} />}>
          Admin
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  ) : null
}
