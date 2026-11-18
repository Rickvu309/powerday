import type { ComponentType } from "react"
import { GuideBadge, TodoBadge, TrackerBadge, TravelBadge } from "./office-art"
import { GuidePreview, PhotographyPreview, TodoPreview, TrackerPreview, TravelPreview } from "./office-previews"

export type OfficeKind = "page" | "slides" | "site" | "image"
export type OfficeOrigin = "yours" | "shared"

export type OfficeDocument = {
  readonly id: string
  readonly title: string
  readonly kind: OfficeKind
  readonly Preview: ComponentType
}

export type OfficeTemplate = {
  readonly document: OfficeDocument
  readonly label: string
  readonly Badge?: ComponentType
}

export type OfficeItem = {
  readonly document: OfficeDocument
  readonly origin: OfficeOrigin
  readonly favorite: boolean
  readonly updated: number
}

const guidePages: OfficeDocument = {
  id: "guide-pages",
  title: "Your guide to pages",
  kind: "page",
  Preview: GuidePreview,
}
const toDoList: OfficeDocument = { id: "to-do-list", title: "To-do list", kind: "page", Preview: TodoPreview }
const projectTracker: OfficeDocument = {
  id: "project-tracker",
  title: "Project tracker",
  kind: "page",
  Preview: TrackerPreview,
}
const photographyPortfolio: OfficeDocument = {
  id: "photography-portfolio",
  title: "Photography Portfolio",
  kind: "slides",
  Preview: PhotographyPreview,
}
const travelPlanner: OfficeDocument = {
  id: "travel-planner",
  title: "Travel planner",
  kind: "page",
  Preview: TravelPreview,
}

export const officeKinds: readonly OfficeKind[] = ["page", "slides", "site", "image"]

export const officeTemplates: readonly OfficeTemplate[] = [
  { document: guidePages, label: "Start here", Badge: GuideBadge },
  { document: toDoList, label: "Page", Badge: TodoBadge },
  { document: projectTracker, label: "Page", Badge: TrackerBadge },
  { document: photographyPortfolio, label: "Slides" },
  { document: travelPlanner, label: "Page", Badge: TravelBadge },
]

export const officeItems: readonly OfficeItem[] = [
  { document: photographyPortfolio, origin: "yours", favorite: false, updated: 1795046400000 },
  { document: guidePages, origin: "yours", favorite: false, updated: 1794960000000 },
]
