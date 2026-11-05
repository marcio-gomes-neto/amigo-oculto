import { GroupListPage } from './components/GroupListPage.jsx';
import { GroupPage } from './components/GroupPage.jsx';
import { Icon } from './components/Icon.jsx';
import { SecretPage } from './components/SecretPage.jsx';
import { useRoute } from './hooks/useRoute.js';

export default function App() {
  const route = useRoute();

  return (
    <>
      <header className="hero">
        <div className="hero-inner">
          <span className="hero-logo" aria-hidden="true">
            🎁
          </span>
          <h1>Amigo Oculto</h1>
          <p>Cadastre a turma, defina as regras e deixe o sorteio com a gente. Cada pessoa descobre por email quem tirou.</p>
          <ol className="hero-steps">
            <li>
              <Icon name="users" size={16} /> Participantes
            </li>
            <li>
              <Icon name="ban" size={16} /> Regras
            </li>
            <li>
              <Icon name="mail" size={16} /> Sorteio por email
            </li>
          </ol>
        </div>
      </header>

      <main className="container">
        {route.page === 'list' && <GroupListPage />}
        {route.page === 'group' && <GroupPage key={route.groupId} groupId={route.groupId} />}
        {route.page === 'secret' && <SecretPage key={route.groupId} groupId={route.groupId} />}
      </main>

      {route.page !== 'secret' && (
        <footer className="footer">
          <p>🤫 O resultado nunca aparece na tela — só no email de cada participante.</p>
        </footer>
      )}
    </>
  );
}
