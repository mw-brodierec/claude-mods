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
  /** A side session's: where a press opens it, its active time, its state, its short name. */
  link?: string
  name?: string
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
  /** Marc: the Shipped group of the jobs view folded. */
  isShippedCollapsed?: boolean
}

export type JobStatus = 'running' | 'waiting' | 'planned' | 'later' | 'shipped'

/** One job of a build: one PR, run by one or more agents or side sessions. */
export type Job = {
  id: string
  /** Shown above the title, "Job 5" when left out. */
  label?: string
  title: string
  detail?: string
  status: JobStatus
  waitingOn?: string
  pr?: string
  prUrl?: string
  /** Side session names or local_… ids, or subagent descriptions, doing this job. */
  sessions: string[]
  /** Epoch ms of the job's last change. */
  updated: number
}

/** A build of many jobs, kept in ~/.claude/savvy-progress/builds/<id>.json. */
export type Build = {
  id: string
  name: string
  /** The project root of the session that started it; a new session there picks it up. */
  project: string
  summary?: string
  /** Path or link to the build memo / SOP. */
  memo?: string
  jobs: Job[]
  createdAt: number
  updatedAt: number
  isFinished: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'savvy-progress': {
      flow: Flow | null
      agents: AgentRun[]
      sessions: SideSession[]
      panel: Panel
      now: number
      build: Build | null
    }
  }
}
