import { StrictMode, Suspense } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./app"
import { ScreenIndex, screenFor } from "./screens"
import "./styles/app.css"

const path = window.location.pathname
const Screen = screenFor(path)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {path.replace(/\/$/, "") === "/screens" ? (
      <ScreenIndex />
    ) : Screen ? (
      <Suspense>
        <Screen />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
