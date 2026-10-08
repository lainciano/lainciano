import { TransitionLink } from "@/components/ui/TransitionLink";
import { doors } from "@/lib/content/copy";

type RoomDoorProps = {
  href: string;
  /** Nome gótico da sala de destino ("Projetos", "Biblioteca", "Câmara"…). */
  room: string;
  /** Rótulo comum ("Projetos", "Blog", nome do case…). */
  label: string;
};

// Porta de fim de página (spec 6.3). O nome acessível é o rótulo comum; o gótico é decorativo.
export function RoomDoor({ href, room, label }: RoomDoorProps) {
  return (
    <nav aria-label={doors.navLabel} className="content-container pb-section">
      <TransitionLink href={href} data-verbo="abra" className="room-door focus-ring">
        <span className="room-door__rotulo text-verb">{doors.next(label)}</span>
        <span aria-hidden="true" className="room-door__sala">
          {room}
        </span>
        <span aria-hidden="true" className="room-door__seta">
          →
        </span>
      </TransitionLink>
    </nav>
  );
}
