import {
  FileTextIcon,
  GlobeIcon,
  ImagesIcon,
  LayoutGridIcon,
  PresentationIcon,
  SquarePenIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { showComingSoon } from "@/features/toast/coming-soon"
import { officeMark } from "./office-art"
import { setOfficeKind, useOfficeKind } from "./office-kind"
import { officeItems, officeKinds, type OfficeKind } from "./office-registry"

const kindLabel: Record<OfficeKind, string> = {
  page: "Pages",
  slides: "Slides",
  site: "Sites",
  image: "Images",
}

const kindIcon: Record<OfficeKind, LucideIcon> = {
  page: FileTextIcon,
  slides: PresentationIcon,
  site: GlobeIcon,
  image: ImagesIcon,
}

export function OfficeSidebar({ trigger }: { trigger: ReactNode }) {
  const { isMobile, setOpenMobile } = useSidebar()
  const kind = useOfficeKind()
  const close = () => {
    if (isMobile) setOpenMobile(false)
  }
  const recents = [...officeItems]
    .filter((item) => item.origin === "yours")
    .sort((first, second) => second.updated - first.updated)
  return (
    <>
      <SidebarHeader className="h-12 flex-row items-center justify-between gap-2 pr-3 pl-4">
        <span className="truncate text-lg font-semibold">Office</span>
        {trigger}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  close()
                  showComingSoon("Creating")
                }}
              >
                <SquarePenIcon className="text-primary" />
                <span>Create</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarMenu className="group-data-[collapsible=icon]:hidden">
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={kind === null}
                aria-pressed={kind === null}
                onClick={() => {
                  setOfficeKind(null)
                  close()
                }}
              >
                <LayoutGridIcon />
                <span>All</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {officeKinds.map((each) => {
              const Icon = kindIcon[each]
              return (
                <SidebarMenuItem key={each}>
                  <SidebarMenuButton
                    isActive={kind === each}
                    aria-pressed={kind === each}
                    onClick={() => {
                      setOfficeKind(each)
                      close()
                    }}
                  >
                    <Icon />
                    <span>{kindLabel[each]}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Recents</SidebarGroupLabel>
          <SidebarMenu>
            {recents.map((item) => {
              const Mark = officeMark[item.document.kind]
              return (
                <SidebarMenuItem key={item.document.id}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <SidebarMenuButton
                          onClick={() => {
                            close()
                            showComingSoon(item.document.title)
                          }}
                        >
                          <Mark />
                          <span className="truncate">{item.document.title}</span>
                        </SidebarMenuButton>
                      }
                    />
                    <TooltipContent side="right">{item.document.title}</TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Spaces</SidebarGroupLabel>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                close()
                showComingSoon("Trash")
              }}
            >
              <Trash2Icon />
              <span>Trash</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  )
}
