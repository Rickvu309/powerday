import { useEffect, type ComponentProps } from "react"
import { Sidebar, useSidebar } from "@/components/ui/sidebar"

export function NavigationSidebar(props: ComponentProps<typeof Sidebar>) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar()
  useEffect(() => {
    if (!isMobile || !openMobile) return
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return
      if (
        document.querySelector(
          '[aria-haspopup="menu"][aria-expanded="true"], [role="menu"]:not([data-ending-style]), [role="dialog"]:not([data-sidebar="sidebar"]):not([data-ending-style])',
        )
      )
        return
      event.preventDefault()
      event.stopPropagation()
      setOpenMobile(false)
    }
    document.addEventListener("keydown", dismiss, true)
    return () => document.removeEventListener("keydown", dismiss, true)
  }, [isMobile, openMobile, setOpenMobile])
  return <Sidebar {...props} />
}
