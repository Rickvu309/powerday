export const catalogConfig = {
  providers: [{ id: "mock", kind: "mock", label: "Mock" }],
  models: [
    {
      id: "mock-fast",
      provider: "mock",
      upstreamId: "upstream-fast",
      label: "Mock Fast",
      status: "enabled",
      capabilities: { tools: false, vision: false, reasoning: false },
      contextWindow: 8192,
      price: "mock-free",
    },
    {
      id: "mock-retired",
      provider: "mock",
      upstreamId: "upstream-retired",
      label: "Mock Retired",
      status: "disabled",
      capabilities: { tools: true, vision: true, reasoning: true },
      contextWindow: 4096,
      price: "mock-free",
    },
  ],
}
