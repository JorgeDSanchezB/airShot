-- AirShot: ventana de recorte por escena para el editor de timeline.
ALTER TABLE "Scene" ADD COLUMN "trimStartSeconds" REAL;
ALTER TABLE "Scene" ADD COLUMN "trimEndSeconds" REAL;
