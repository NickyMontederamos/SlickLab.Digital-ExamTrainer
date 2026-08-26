-- AlterTable
ALTER TABLE "ExamAttempt" ADD COLUMN     "downloadCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ExamVersion" ADD COLUMN     "assessmentPassword" TEXT,
ADD COLUMN     "downloadEndAt" TIMESTAMP(3),
ADD COLUMN     "downloadStartAt" TIMESTAMP(3),
ADD COLUMN     "maxDownloads" INTEGER,
ADD COLUMN     "pingAndRelease" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "remoteDeletionAt" TIMESTAMP(3),
ADD COLUMN     "sendDownloadEndReminder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sendUploadDeadlineReminder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "universalResumeCode" TEXT;
