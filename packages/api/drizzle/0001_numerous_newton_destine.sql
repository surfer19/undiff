CREATE TABLE "solution_branches" (
	"id" varchar(21) PRIMARY KEY NOT NULL,
	"run_id" varchar(21) NOT NULL,
	"option_id" varchar(1) NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"new_files" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pros" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risk" varchar(10) DEFAULT 'medium' NOT NULL,
	"complexity_delta" integer DEFAULT 0 NOT NULL,
	"files_changed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"sandbox" jsonb DEFAULT 'null'::jsonb,
	"agent_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "explore_runs" ALTER COLUMN "comment_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "solution_branches" ADD CONSTRAINT "solution_branches_run_id_explore_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."explore_runs"("id") ON DELETE no action ON UPDATE no action;