import { pgTable, text, integer, bigint, timestamp, jsonb, varchar } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type {
  ExploreRunStatus,
  ExplorationOption,
  PrRef,
  LineRange,
  DeliveryMode,
  SolutionBranchStatus,
  RiskLevel,
  SandboxResult,
  AgentLogEntry,
} from '@sage/shared';

export const exploreRuns = pgTable('explore_runs', {
  id: varchar('id', { length: 21 }).primaryKey(), // nanoid
  prRef: jsonb('pr_ref').$type<PrRef>().notNull(),
  filePath: text('file_path').notNull(),
  lineRange: jsonb('line_range').$type<LineRange>().notNull(),
  diffHunk: text('diff_hunk').notNull(),
  headRef: varchar('head_ref', { length: 255 }).notNull(),
  prompt: text('prompt').notNull(),
  status: varchar('status', { length: 20 }).$type<ExploreRunStatus>().notNull().default('pending'),
  commentId: bigint('comment_id', { mode: 'number' }).notNull(),
  options: jsonb('options').$type<ExplorationOption[]>().notNull().default([]),
  selectedOptionIds: jsonb('selected_option_ids').$type<string[]>().notNull().default([]),
  pickedBranchId: varchar('picked_branch_id', { length: 21 }),
  deliveryMode: varchar('delivery_mode', { length: 10 }).$type<DeliveryMode>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Relations ──────────────────────────────────────────────────────────────

export const exploreRunsRelations = relations(exploreRuns, ({ many }) => ({
  solutionBranches: many(solutionBranches),
}));

// ─── Solution Branches ──────────────────────────────────────────────────────

export const solutionBranches = pgTable('solution_branches', {
  id: varchar('id', { length: 21 }).primaryKey(), // nanoid
  runId: varchar('run_id', { length: 21 })
    .notNull()
    .references(() => exploreRuns.id),
  optionId: varchar('option_id', { length: 1 }).notNull(),
  label: text('label').notNull(),
  description: text('description').notNull(),
  code: text('code').notNull().default(''),
  newFiles: jsonb('new_files').$type<Record<string, string>>().notNull().default({}),
  pros: jsonb('pros').$type<string[]>().notNull().default([]),
  cons: jsonb('cons').$type<string[]>().notNull().default([]),
  risk: varchar('risk', { length: 10 }).$type<RiskLevel>().notNull().default('medium'),
  complexityDelta: integer('complexity_delta').notNull().default(0),
  filesChanged: jsonb('files_changed').$type<string[]>().notNull().default([]),
  status: varchar('status', { length: 20 })
    .$type<SolutionBranchStatus>()
    .notNull()
    .default('pending'),
  sandbox: jsonb('sandbox').$type<SandboxResult | null>().default(null),
  agentLog: jsonb('agent_log').$type<AgentLogEntry[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const solutionBranchesRelations = relations(solutionBranches, ({ one }) => ({
  exploreRun: one(exploreRuns, {
    fields: [solutionBranches.runId],
    references: [exploreRuns.id],
  }),
}));

// ─── Row Types ──────────────────────────────────────────────────────────────

export type ExploreRunRow = typeof exploreRuns.$inferSelect;
export type NewExploreRunRow = typeof exploreRuns.$inferInsert;
export type SolutionBranchRow = typeof solutionBranches.$inferSelect;
export type NewSolutionBranchRow = typeof solutionBranches.$inferInsert;
