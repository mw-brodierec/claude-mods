export type Phase = 'plan' | 'design' | 'delegate' | 'review' | 'close'

export type PlannedTask = {
  title: string
  tier: string
  after: number[]
  /** The side session doing this task: its name or `local_…` id. */
  session?: string
}

export type Flow = {
  title: string
  total: number
  done: number
  running: number
  phase: Phase
  isFinished: boolean
  tasks: PlannedTask[]
}

export type AgentStatus = 'running' | 'done' | 'failed' | 'waiting'

export type AgentRun = {
  id: string
  agentId?: string
  type: string
  description: string
  model: string
  effort?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  contextMax: number
  tokens: number
  /** The part of `tokens` read back from the prompt cache: the context re-sent on every request. */
  cachedTokens?: number
  costUsd: number
  steps: number
  round: number
  /** Self-reported by the worker through the `step` tool. */
  stepDone?: number
  stepTotal?: number
  stepNote?: string
  /** A side session's: where a press opens it, its active time, its state. */
  link?: string
  activeMs?: number
  note?: string
}

/** One side session this session started, as hooks/sessions.py reads it. */
export type SideSession = {
  id: string
  name: string
  title: string
  link: string
  model: string
  effort: string
  running: boolean
  state: string
  createdAt: number
  lastAt: number
  activeMs: number
  context: number
  requests: number
  /** Per model: input, output, cache read, cache write 5m, cache write 1h. */
  models: Record<string, number[]>
}

export type Panel = {
  isCompact: boolean
  isDoneCollapsed: boolean
  autoOpenedFor: string
}

declare module 'claude-code' {
  interface PluginState {
    'savvy-progress': {
      flow: Flow | null
      agents: AgentRun[]
      sessions: SideSession[]
      panel: Panel
      now: number
    }
  }
}
