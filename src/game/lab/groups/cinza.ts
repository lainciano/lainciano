import { buildDoor, buildLamp, buildNotebook, buildPencil, buildRug, buildTable, buildWardrobe } from "../../layers/cinza/models";
import { LAMP, ROOM } from "../../layers/cinza/places";
import type { LabBuild, LabId } from "../registry";

/** Peças da sala cinza, do jeito que a cena as monta (o laboratório as centraliza). */
export const builders: Partial<Record<LabId, LabBuild>> = {
  mesa: (m) => buildTable(m).root,
  caderno: (m) => buildNotebook(m, 0, 0, 0),
  lapis: (m) => buildPencil(m, 0, 0, 0),
  armario: (m) => buildWardrobe(m),
  porta: (m) => buildDoor(m),
  tapete: (m) => buildRug(m),
  lampada: (m) => buildLamp(m, 0, ROOM.h, 0, LAMP.bulbY).pivot,
};
