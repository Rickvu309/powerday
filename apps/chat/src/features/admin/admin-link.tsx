import { enterAdmin, useAdminPage } from "./admin-navigation"
import { useEffect, useState } from "react"
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar } from "@/components/ui/sidebar"

export function AdminLink() {
  const { isMobile, setOpenMobile, openMobile } = useSidebar()
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
  useEffect(() => {
    if (!active || !isMobile || openMobile) return
    const focus = () => {
      if (document.querySelector('[data-mobile="true"]')) return
      document.getElementById("admin-title")?.focus()
      observer.disconnect()
    }
    const observer = new MutationObserver(focus)
    observer.observe(document.body, { childList: true, subtree: true })
    focus()
    return () => observer.disconnect()
  }, [active, isMobile, openMobile])
  return admin ? (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={active}
          render={
            <a
              href="/admin"
              onClick={(event) => {
                enterAdmin(event)
                if (event.defaultPrevented && isMobile) setOpenMobile(false)
              }}
            />
          }
        >
          Admin
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  ) : null
}
