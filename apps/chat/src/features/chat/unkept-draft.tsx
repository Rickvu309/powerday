import { Button } from "@/components/ui/button"

export function UnkeptDraft({ draft, onSignIn }: { draft: string; onSignIn: () => void }) {
  return (
    <div role="alert" tabIndex={0} className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 text-sm">
      <p>Couldn’t keep your message in this browser. Copy it before signing in.</p>
      <textarea aria-label="Message to keep" readOnly value={draft} className="w-full rounded-md border p-3" />
      <Button variant="outline" onClick={onSignIn}>
        I copied it. Sign in
      </Button>
    </div>
  )
}
