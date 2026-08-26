-- CreateEnum
CREATE TYPE "ExamKind" AS ENUM ('STANDARD', 'BENCHMARK');

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "isBenchmarkBank" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "kind" "ExamKind" NOT NULL DEFAULT 'STANDARD';

-- CreateTable
CREATE TABLE "LinkedAssessment" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "sourceExamId" TEXT NOT NULL,
    "linkedExamId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkedAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LinkedAssessment_linkedExamId_key" ON "LinkedAssessment"("linkedExamId");

-- CreateIndex
CREATE INDEX "LinkedAssessment_institutionId_idx" ON "LinkedAssessment"("institutionId");

-- CreateIndex
CREATE INDEX "LinkedAssessment_sourceExamId_idx" ON "LinkedAssessment"("sourceExamId");

-- AddForeignKey
ALTER TABLE "LinkedAssessment" ADD CONSTRAINT "LinkedAssessment_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedAssessment" ADD CONSTRAINT "LinkedAssessment_sourceExamId_fkey" FOREIGN KEY ("sourceExamId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedAssessment" ADD CONSTRAINT "LinkedAssessment_linkedExamId_fkey" FOREIGN KEY ("linkedExamId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedAssessment" ADD CONSTRAINT "LinkedAssessment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
