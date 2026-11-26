-- AirShot: historial de assets por escena (versionado + undo).
CREATE TABLE "SceneAssetVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "provider" TEXT,
    "prompt" TEXT,
    "meta" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SceneAssetVersion_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SceneAssetVersion_sceneId_kind_createdAt_idx" ON "SceneAssetVersion"("sceneId", "kind", "createdAt");
