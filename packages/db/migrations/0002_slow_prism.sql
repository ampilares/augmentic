ALTER TABLE "chat_messages" DROP CONSTRAINT "chat_messages_workflow_run_id_workflow_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE set null ON UPDATE no action;