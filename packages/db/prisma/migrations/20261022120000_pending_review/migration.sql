-- AlterTable
ALTER TABLE "company" ADD COLUMN "pendingReview" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "contact" ADD COLUMN "pendingReview" BOOLEAN NOT NULL DEFAULT false;
