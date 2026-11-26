-- Semillas visuales para reproducibilidad (proyecto por defecto, override por escena)
ALTER TABLE "Project" ADD COLUMN "visualSeed" INTEGER;
ALTER TABLE "Scene" ADD COLUMN "seed" INTEGER;
