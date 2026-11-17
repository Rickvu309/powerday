import { signInMail } from "@powerday/chat-core"

const mail = signInMail(
  "ada@example.com",
  "https://chat.example.com/api/auth/magic-link/verify?token=123456&email=ada%40example.com",
  "123456",
)

export default function SignInEmail() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-medium">Sign-in email</h1>
      <p className="text-sm text-muted-foreground">Subject: {mail.subject}</p>
      <iframe
        title="Sign-in email HTML"
        sandbox=""
        srcDoc={mail.html}
        className="h-[820px] w-full border border-border"
      />
      <h2 className="text-lg font-medium">Plain text</h2>
      <pre className="rounded-xl bg-muted p-4 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{mail.text}</pre>
    </main>
  )
}
