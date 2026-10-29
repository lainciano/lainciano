/**
 * Cartão do exame (T9): título e texto do objeto na mão e a saída. Fecha com E, ⌫ ou botão direito (o Esc é do
 * navegador e nunca é rótulo); o botão serve ao toque e ao mouse. Não rouba o foco ao abrir (o teclado segue na
 * cena); quem fecha devolve o foco à casca. Rótulos por props. Em toque (`showKeys` falso) o botão não mostra glifos de tecla.
 */
export default function ExamineCard({ title, text, closeLabel, showKeys, onClose }: { title: string; text: string; closeLabel: string; showKeys: boolean; onClose: () => void }) {
  return (
    <>
      <div data-game-veil aria-hidden="true" />
      <section data-game-examine aria-label={title}>
        <h2>{title}</h2>
        <p>{text}</p>
        <button type="button" className="focus-ring" onClick={onClose}>
          {showKeys && <kbd>E</kbd>}
          {showKeys && <kbd>⌫</kbd>}
          <span>{closeLabel}</span>
        </button>
      </section>
    </>
  );
}
