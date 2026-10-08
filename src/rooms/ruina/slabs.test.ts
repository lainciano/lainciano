import { describe, expect, it } from "vitest";
import { slabTone, toSlabs } from "@/rooms/ruina/slabs";

describe("slabTone", () => {
  it("como no protótipo: 1ª em sangue, depois osso e ferrugem alternados", () => {
    expect([0, 1, 2, 3, 4].map(slabTone)).toEqual(["sangue", "osso", "ferrugem", "osso", "ferrugem"]);
  });
});

describe("toSlabs", () => {
  it("rótulo Mono 'ano · tipo' e só o ano quando falta o tipo", () => {
    expect(
      toSlabs([
        { slug: "brazskate", title: "Braz Skate", year: 2026, kind: "evento" },
        { slug: "x", title: "X", year: 2025 },
      ]),
    ).toEqual([
      { slug: "brazskate", title: "Braz Skate", meta: "2026 · evento", tone: "sangue" },
      { slug: "x", title: "X", meta: "2025", tone: "osso" },
    ]);
  });
});
