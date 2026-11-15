import { lazy, type ComponentType } from "react"

const files = import.meta.glob<{ default: ComponentType }>("./features/*/screens/*.tsx")

const screens = new Map(
  Object.entries(files).map(([file, load]) => [
    `/screens/${file.slice(file.lastIndexOf("/") + 1, -".tsx".length)}`,
    lazy(load),
  ]),
)

if (screens.size !== Object.keys(files).length) throw new Error("two screens share an id")

export const screenFor = (path: string) => screens.get(path.replace(/\/$/, ""))

export function ScreenIndex() {
  return (
    <main className="p-8">
      <ul className="flex flex-col gap-2 text-sm">
        {[...screens.keys()].sort().map((path) => (
          <li key={path}>
            <a className="underline underline-offset-4" href={path}>
              {path}
            </a>
          </li>
        ))}
      </ul>
    </main>
  )
}
