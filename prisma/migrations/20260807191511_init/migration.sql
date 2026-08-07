-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "sources" TEXT[],
    "topicTags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RejectedTopic" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "consideredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rejectedInFavorOfPostId" TEXT,

    CONSTRAINT "RejectedTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaProfile" (
    "agentId" TEXT NOT NULL,
    "styleGuide" TEXT NOT NULL,
    "standingInterests" TEXT[],
    "editorialStandards" TEXT NOT NULL,

    CONSTRAINT "PersonaProfile_pkey" PRIMARY KEY ("agentId")
);

-- CreateIndex
CREATE INDEX "Post_agentId_createdAt_idx" ON "Post"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "RejectedTopic_agentId_consideredAt_idx" ON "RejectedTopic"("agentId", "consideredAt");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RejectedTopic" ADD CONSTRAINT "RejectedTopic_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RejectedTopic" ADD CONSTRAINT "RejectedTopic_rejectedInFavorOfPostId_fkey" FOREIGN KEY ("rejectedInFavorOfPostId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaProfile" ADD CONSTRAINT "PersonaProfile_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
