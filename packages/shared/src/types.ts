// ─── PR Reference ───────────────────────────────────────────────────────────

export interface PrRef {
  owner: string;
  repo: string;
  number: number;
  installationId: number;
}

// ─── Line Range ─────────────────────────────────────────────────────────────

export interface LineRange {
  start: number;
  end: number;
}

// ─── Explore Run ────────────────────────────────────────────────────────────

export type ExploreRunStatus =
  | 'pending'
  | 'analyzing'
  | 'options_ready'
  | 'running'
  | 'completed'
  | 'failed';

export interface ExploreRun {
  id: string;
  prRef: PrRef;
  filePath: string;
  lineRange: LineRange;
  diffHunk: string;
  headRef: string;
  prompt: string;
  status: ExploreRunStatus;
  commentId: number;
  options: ExplorationOption[];
  selectedOptionIds: string[];
  pickedBranchId: string | null;
  deliveryMode: DeliveryMode | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Exploration Options ────────────────────────────────────────────────────

export interface ExplorationOption {
  id: string; // "A", "B", "C"
  label: string;
  description: string;
  estimatedImpact: {
    filesChanged: number;
    complexityDelta: number;
    riskLevel: RiskLevel;
  };
  isPreferred: boolean;
  preferredReason?: string;
}

// ─── Agent Log ──────────────────────────────────────────────────────────────

export interface AgentLogEntry {
  step: string;
  action: string;
  reasoning: string;
  outcome: string;
  durationMs: number;
}

// ─── Solution Branch ────────────────────────────────────────────────────────

export type SolutionBranchStatus =
  | 'pending'
  | 'generating'
  | 'sandbox_running'
  | 'completed'
  | 'failed';

export interface SolutionBranch {
  id: string;
  runId: string;
  optionId: string;
  label: string;
  description: string;
  code: string;
  newFiles: Record<string, string>;
  pros: string[];
  cons: string[];
  risk: RiskLevel;
  complexityDelta: number;
  filesChanged: string[];
  status: SolutionBranchStatus;
  sandbox: SandboxResult | null;
  agentLog: AgentLogEntry[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sandbox Result ─────────────────────────────────────────────────────────

export interface SandboxResult {
  buildStatus: 'passed' | 'failed' | 'skipped';
  testResults: {
    total: number;
    passed: number;
    failed: number;
    failedNames: string[];
  };
  screenshots: {
    before: string[];
    after: string[];
    diff: string[];
    hasVisualRegression: boolean;
  } | null;
  totalDurationMs: number;
}

// ─── Delivery ───────────────────────────────────────────────────────────────

export type DeliveryMode = 'suggest' | 'commit' | 'pr';

// ─── Shared Enums / Unions ──────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high';

// ─── Webhook Payloads ───────────────────────────────────────────────────────

export interface ExploreCommand {
  prompt: string;
  commentId: number;
  prRef: PrRef;
  filePath: string;
  lineRange: LineRange;
  diffHunk: string;
  headRef: string;
}

export interface RunCommand {
  runId: string;
  selectedOptionIds: string[];
  commentId: number;
  prRef: PrRef;
}
