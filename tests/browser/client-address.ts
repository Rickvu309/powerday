const next = new Map<number, number>()

export const clientAddress = (workerIndex: number) => {
  const sequence = (next.get(workerIndex) ?? 0) + 1
  next.set(workerIndex, sequence)
  if (sequence > 4096) throw new Error("exhausted test client addresses")
  const index = workerIndex * 4096 + sequence
  const second = 18 + (index >> 16)
  const third = (index >> 8) & 255
  const fourth = index & 255
  if (second > 19) throw new Error("exhausted test client addresses")
  return `198.${second}.${third}.${fourth}`
}
