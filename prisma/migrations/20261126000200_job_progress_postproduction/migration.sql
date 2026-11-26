-- AirShot T21: progreso persistente de jobs y artefactos de postproducción
ALTER TABLE "AssemblyJob" ADD COLUMN "progress" TEXT;
ALTER TABLE "AssemblyJob" ADD COLUMN "subtitlesPath" TEXT;
ALTER TABLE "AssemblyJob" ADD COLUMN "thumbnailPath" TEXT;
