ALTER TABLE "document_analyses" ALTER COLUMN "document_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "document_analyses" ADD COLUMN "source" text DEFAULT 'document' NOT NULL;