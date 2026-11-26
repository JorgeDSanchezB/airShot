-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "originalStory" TEXT NOT NULL,
    "improvedStory" TEXT,
    "visualStyleId" TEXT,
    "videoProvider" TEXT,
    "ttsProvider" TEXT,
    "outputFormat" TEXT NOT NULL DEFAULT 'mp4',
    "outputResolution" TEXT NOT NULL DEFAULT '720p',
    "voiceId" TEXT,
    "musicAssetKey" TEXT,
    "musicVolume" REAL NOT NULL DEFAULT 0.25,
    "musicOriginalName" TEXT,
    "musicDurationSeconds" REAL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_visualStyleId_fkey" FOREIGN KEY ("visualStyleId") REFERENCES "VisualStyle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "originalText" TEXT NOT NULL,
    "improvedText" TEXT,
    "promptEn" TEXT,
    "durationSeconds" INTEGER NOT NULL DEFAULT 6,
    "narrationSource" TEXT NOT NULL DEFAULT 'improved',
    "narrationText" TEXT,
    "voiceId" TEXT,
    "imageBasePath" TEXT,
    "videoClipPath" TEXT,
    "videoProviderJobId" TEXT,
    "videoEffectiveSeconds" REAL,
    "audioPath" TEXT,
    "audioDurationSeconds" REAL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Scene_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SceneReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    CONSTRAINT "SceneReference_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SceneReference_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "Reference" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "attributes" TEXT NOT NULL DEFAULT '{}',
    "referenceImages" TEXT NOT NULL DEFAULT '[]',
    "libraryScope" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'basic',
    "attributesSchemaVersion" TEXT NOT NULL DEFAULT 'v1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VisualStyle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "promptFragmentEn" TEXT NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProviderConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerType" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT,
    "baseUrl" TEXT,
    "defaultParams" TEXT NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastCheck" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AssemblyJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL DEFAULT 'assembly',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "outputPath" TEXT,
    "report" TEXT,
    "errorMessage" TEXT,
    "params" TEXT NOT NULL DEFAULT '{}',
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssemblyJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Project_createdAt_id_idx" ON "Project"("createdAt", "id");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Scene_projectId_createdAt_id_idx" ON "Scene"("projectId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Scene_projectId_status_idx" ON "Scene"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Scene_projectId_orderIndex_key" ON "Scene"("projectId", "orderIndex");

-- CreateIndex
CREATE INDEX "SceneReference_referenceId_idx" ON "SceneReference"("referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "SceneReference_sceneId_referenceId_key" ON "SceneReference"("sceneId", "referenceId");

-- CreateIndex
CREATE INDEX "Reference_projectId_createdAt_id_idx" ON "Reference"("projectId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Reference_libraryScope_type_createdAt_id_idx" ON "Reference"("libraryScope", "type", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Reference_createdAt_id_idx" ON "Reference"("createdAt", "id");

-- CreateIndex
CREATE INDEX "VisualStyle_createdAt_id_idx" ON "VisualStyle"("createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "VisualStyle_name_key" ON "VisualStyle"("name");

-- CreateIndex
CREATE INDEX "ProviderConfig_providerType_createdAt_id_idx" ON "ProviderConfig"("providerType", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ProviderConfig_createdAt_id_idx" ON "ProviderConfig"("createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderConfig_providerType_providerName_key" ON "ProviderConfig"("providerType", "providerName");

-- CreateIndex
CREATE INDEX "AssemblyJob_projectId_createdAt_id_idx" ON "AssemblyJob"("projectId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AssemblyJob_createdAt_id_idx" ON "AssemblyJob"("createdAt", "id");

