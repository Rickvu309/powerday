import { FileTextIcon, GlobeIcon, ImagesIcon, PresentationIcon } from "lucide-react"
import type { ComponentType } from "react"
import type { OfficeKind } from "./office-registry"

export const coverCream = "#F6F1EE"
export const pageBlue = "#2563eb"
export const todoGreen = "#16a34a"
export const slidesAmber = "#d97706"
export const alertRed = "#dc2626"
export const officeLift = "0 1px 2px rgba(31,31,31,0.06), 0 6px 20px rgba(31,31,31,0.07)"

const photoBlock = "#ece5df"

function PageMark() {
  return <FileTextIcon style={{ color: pageBlue }} />
}

function SlidesMark() {
  return <PresentationIcon style={{ color: slidesAmber }} />
}

function SiteMark() {
  return <GlobeIcon className="text-muted-foreground" />
}

function ImageMark() {
  return <ImagesIcon className="text-muted-foreground" />
}

export const officeMark: Record<OfficeKind, ComponentType> = {
  page: PageMark,
  slides: SlidesMark,
  site: SiteMark,
  image: ImageMark,
}

const studies = [
  { x: 4, y: 104, height: 84, ink: "#7a716a" },
  { x: 84, y: 84, height: 104, ink: "#55504b" },
  { x: 164, y: 64, height: 124, ink: "#2e2a27" },
  { x: 244, y: 84, height: 104, ink: "#55504b" },
  { x: 324, y: 104, height: 84, ink: "#7a716a" },
]

export function Collage() {
  return (
    <svg aria-hidden viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" className="block h-full w-full">
      <rect width="400" height="200" fill={coverCream} />
      {studies.map((study) => (
        <g key={study.x}>
          <rect x={study.x} y={study.y} width="72" height={study.height} rx="6" fill={photoBlock} />
          <circle cx={study.x + 36} cy={study.y + study.height * 0.3} r={study.height * 0.115} fill={study.ink} />
          <rect
            x={study.x + 13}
            y={study.y + study.height * 0.52}
            width="46"
            height={study.height * 0.48}
            rx="12"
            fill={study.ink}
          />
        </g>
      ))}
    </svg>
  )
}
