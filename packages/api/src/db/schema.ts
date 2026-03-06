import { pgTable, text, integer, bigint, timestamp, jsonb, varchar } from 'drizzle-orm/pg-core';
import type {
  ExploreRunStatus,
  ExplorationOption,
  PrRef,
  LineRange,
  DeliveryMode,
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

export type ExploreRunRow = typeof exploreRuns.$inferSelect;
export type NewExploreRunRow = typeof exploreRuns.$inferInsert;
