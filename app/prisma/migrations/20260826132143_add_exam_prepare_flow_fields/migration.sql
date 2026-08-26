-- AlterTable
ALTER TABLE "ExamQuestion" ADD COLUMN     "sectionTitle" TEXT;

-- AlterTable
ALTER TABLE "ExamVersion" ADD COLUMN     "copyPasteAllowed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "examMonitoringEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "highlightingAllowed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "spellCheckAllowed" BOOLEAN NOT NULL DEFAULT true;
