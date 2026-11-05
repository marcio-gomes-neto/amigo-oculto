import { secretHref } from '../hooks/useRoute.js';
import { Icon } from './Icon.jsx';
import { Section } from './Section.jsx';

/** Atalho para a área secreta. Só aparece depois que o sorteio foi feito. */
export function SecretAreaSection({ groupId }) {
  return (
    <Section
      step={5}
      title="Área secreta"
      optional
      subtitle="Para resolver problemas: confira se o sorteio está certo e veja quem tirou quem, uma pessoa de cada vez."
    >
      <a className="btn btn-ghost" href={secretHref(groupId)}>
        🔒 Abrir a área secreta
      </a>
      <p className="hint">
        <Icon name="info" size={16} />
        <span>Nada é revelado ao abrir: cada par pede uma confirmação antes de aparecer. Use só se precisar. 🤫</span>
      </p>
    </Section>
  );
}
