-- Doblaje multi-idioma: traducciones por escena con audio propio y pistas SRT por
-- idioma en los jobs de ensamblaje.
CREATE TABLE "SceneTranslation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "audioPath" TEXT,
    "audioDurationSeconds" REAL,
    "voiceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'text_ready',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SceneTranslation_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SceneTranslation_sceneId_language_key" ON "SceneTranslation"("sceneId", "language");
CREATE INDEX "SceneTranslation_sceneId_language_idx" ON "SceneTranslation"("sceneId", "language");

ALTER TABLE "AssemblyJob" ADD COLUMN "subtitlesTracks" TEXT;
ALTER TABLE "AssemblyJob" ADD COLUMN "audioLanguage" TEXT;
