"use client";

import { useEffect, useState } from "react";
import { createRoomTitleDeform } from "@/animations/roomTitleDeform";
import { useReadingMode } from "@/interaction/reading-mode/store";

type RoomTitleTextProps = { as: "h1" | "h2" | "p"; children: string };

// Texto gótico do título de sala; deforma no scroll fora do modo leitura (spec 7.0).
export function RoomTitleText({ as: Tag, children }: RoomTitleTextProps) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const reading = useReadingMode();

  useEffect(() => {
    if (!element || reading) return;
    return createRoomTitleDeform(element);
  }, [element, reading]);

  return (
    <Tag ref={setElement} className="text-room-title">
      {children}
    </Tag>
  );
}
