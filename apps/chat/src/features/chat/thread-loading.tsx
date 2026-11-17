export function ThreadLoading({ question }: { question: string }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 pt-6">
      <div className="mx-auto max-w-3xl">
        <p className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-3xl bg-secondary px-4 py-2.5 text-base leading-7 [overflow-wrap:anywhere]">
          {question}
        </p>
        <p role="status" className="flex h-7 items-center text-sm text-muted-foreground">
          Loading reply…
        </p>
      </div>
    </div>
  )
}
