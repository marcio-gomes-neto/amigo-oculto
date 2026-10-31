import { api } from '../api.js';
import { Icon } from './Icon.jsx';
import { Section } from './Section.jsx';

export function EventSection({ event, setEvent }) {
  const update = (field) => (e) => setEvent((current) => ({ ...current, [field]: e.target.value }));

  return (
    <Section
      step={3}
      title="Detalhes do evento"
      optional
      subtitle="Essas informações aparecem no email que cada participante recebe."
    >
      <div className="event-grid">
        <label className="field">
          <span>Nome do evento</span>
          <input value={event.name} onChange={update('name')} placeholder="Amigo Oculto da Família" maxLength={80} />
        </label>
        <label className="field">
          <span>Data</span>
          <input type="date" value={event.date} onChange={update('date')} />
        </label>
        <label className="field">
          <span>Valor sugerido</span>
          <input value={event.budget} onChange={update('budget')} placeholder="R$ 100,00" maxLength={40} />
        </label>
        <label className="field full">
          <span>Recado para os participantes</span>
          <textarea
            rows={3}
            value={event.message}
            onChange={update('message')}
            placeholder="Ex.: A troca será às 20h na casa da vó. Não esqueçam de embrulhar o presente!"
            maxLength={600}
          />
        </label>
      </div>
      <a className="btn-link" href={api.previewUrl(event)} target="_blank" rel="noreferrer">
        <Icon name="eye" size={16} /> Ver como fica o email (com nomes de exemplo)
      </a>
    </Section>
  );
}
