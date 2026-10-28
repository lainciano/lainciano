/**
 * Cartão do exame (T9): título e texto do objeto na mão e a saída. Fecha com E, ⌫ ou botão direito (o Esc é do
 * navegador e nunca é rótulo); o botão serve ao toque e ao mouse. Não rouba o foco ao abrir (o teclado segue na
 * cena); quem fecha devolve o foco à casca. Rótulos por props.
 */
export default function ExamineCard({ title, text, closeLabel, onClose }: { title: string; text: string; closeLabel: string; onClose: () => void }) {
  return (
    <>
      <div data-game-veil aria-hidden="true" />
      <section data-game-examine aria-label={title}>
        <h2>{title}</h2>
        <p>{text}</p>
        <button type="button" className="focus-ring" onClick={onClose}>
          <kbd>E</kbd>
          <kbd>⌫</kbd>
          <span>{closeLabel}</span>
        </button>
      </section>
    </>
  );
}
