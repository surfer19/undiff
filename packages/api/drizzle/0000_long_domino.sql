CREATE TABLE "explore_runs" (
	"id" varchar(21) PRIMARY KEY NOT NULL,
	"pr_ref" jsonb NOT NULL,
	"file_path" text NOT NULL,
	"line_range" jsonb NOT NULL,
	"diff_hunk" text NOT NULL,
	"head_ref" varchar(255) NOT NULL,
	"prompt" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"comment_id" integer NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected_option_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"picked_branch_id" varchar(21),
	"delivery_mode" varchar(10),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
