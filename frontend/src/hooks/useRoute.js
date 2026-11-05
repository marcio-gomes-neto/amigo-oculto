import { useEffect, useState } from 'react';

/**
 * Navegação simples pelo hash da URL (sem biblioteca de rotas):
 *   #/                            → lista de amigos ocultos
 *   #/amigo-oculto/<id>           → tela de um amigo oculto
 *   #/amigo-oculto/<id>/secreto   → área secreta (quem tirou quem), linkada só depois do sorteio
 */
export const LIST_HREF = '#/';
export const groupHref = (id) => `#/amigo-oculto/${encodeURIComponent(id)}`;
export const secretHref = (id) => `${groupHref(id)}/secreto`;
export const navigate = (href) => {
  window.location.hash = href;
};

function parse(hash) {
  const match = /^#\/amigo-oculto\/([^/]+)(\/secreto)?$/.exec(hash);
  if (!match) return { page: 'list' };
  return { page: match[2] ? 'secret' : 'group', groupId: decodeURIComponent(match[1]) };
}

export function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return parse(hash);
}
