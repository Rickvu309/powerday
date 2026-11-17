import { memo, useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react"
import { Streamdown, defaultComponents } from "streamdown"
import { cn } from "@/lib/class-names"

type Plugins = NonNullable<ComponentProps<typeof Streamdown>["plugins"]>

function ScrollRegion({ children, label, selector }: { children: ReactNode; label: string; selector: string }) {
  const host = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = host.current
    if (!root) return
    const adapt = () => {
      const viewport = root.querySelector(selector)
      if (!(viewport instanceof HTMLElement)) return
      viewport.tabIndex = 0
      viewport.setAttribute("role", "region")
      viewport.setAttribute("aria-label", label)
      viewport.classList.add(
        "overscroll-contain",
        "focus-visible:outline-2",
        "focus-visible:-outline-offset-2",
        "focus-visible:outline-ring",
      )
    }
    adapt()
    const observer = new MutationObserver(adapt)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [label, selector])
  return (
    <div ref={host} className="min-w-0">
      {children}
    </div>
  )
}

const components: NonNullable<ComponentProps<typeof Streamdown>["components"]> = {
  code: (props) => {
    if (!("data-block" in props) || props["data-block"] !== "true") return <defaultComponents.code {...props} />
    return (
      <ScrollRegion label="Code example" selector='[data-streamdown="code-block-body"]'>
        <defaultComponents.code {...props} />
      </ScrollRegion>
    )
  },
  table: (props) => (
    <ScrollRegion label="Data table" selector='[data-streamdown="table-wrapper"] > div.overflow-x-auto'>
      <defaultComponents.table {...props} />
    </ScrollRegion>
  ),
}

export const MessageResponse = memo(function MessageResponse({
  children = "",
  className,
  ...props
}: ComponentProps<typeof Streamdown>) {
  const [plugins, setPlugins] = useState<Plugins>({})
  const math = /\$[^$]+\$|\\\(|\\\[/.test(children)
  const mermaid = /(?:```|~~~)mermaid\b/.test(children)
  const code = /(?:```|~~~)(?!mermaid\b)\S+/.test(children)
  const cjk =
    /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}\u3000-\u303f\uff00-\uffef]/u.test(
      children,
    )
  useEffect(() => {
    let current = true
    if (math)
      void import("@streamdown/math").then(({ math }) => {
        if (current) setPlugins((value) => ({ ...value, math }))
      })
    if (mermaid)
      void import("@streamdown/mermaid").then(({ mermaid }) => {
        if (current) setPlugins((value) => ({ ...value, mermaid }))
      })
    if (code)
      void import("@streamdown/code").then(({ code }) => {
        if (current) setPlugins((value) => ({ ...value, code }))
      })
    if (cjk)
      void import("@streamdown/cjk").then(({ cjk }) => {
        if (current) setPlugins((value) => ({ ...value, cjk }))
      })
    return () => {
      current = false
    }
  }, [math, mermaid, code, cjk])
  return (
    <Streamdown
      {...props}
      codeBlockMaxHeight={400}
      tableMaxHeight={300}
      components={components}
      plugins={plugins}
      className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
    >
      {children}
    </Streamdown>
  )
})
