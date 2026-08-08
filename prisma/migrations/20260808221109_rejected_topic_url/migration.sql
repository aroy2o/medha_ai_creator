-- AlterTable
ALTER TABLE "RejectedTopic" ADD COLUMN     "url" TEXT;

-- CreateIndex
CREATE INDEX "RejectedTopic_agentId_url_idx" ON "RejectedTopic"("agentId", "url");
