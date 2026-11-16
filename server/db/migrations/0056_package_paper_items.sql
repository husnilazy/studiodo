ALTER TABLE "packages" ADD COLUMN "paper_items" jsonb DEFAULT '[]'::jsonb NOT NULL;
