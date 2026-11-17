import { UnkeptDraft } from "../unkept-draft"

export default function DraftStorageFailed() {
  return (
    <main className="flex h-dvh items-center">
      <UnkeptDraft draft="Help me plan my next project." onSignIn={() => undefined} />
    </main>
  )
}
