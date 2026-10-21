// Classificação de propostas por tema, a partir do texto oficial da ementa.
// A identificação é por palavras: pode deixar de fora propostas que usem outros
// termos e pode incluir propostas que apenas tocam no assunto. A página informa isso.

export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

export const TEMAS = [
  {
    id: 'maioridade-penal',
    titulo: 'Maioridade penal',
    explicacao: 'Propostas sobre a idade a partir da qual uma pessoa responde criminalmente como adulto. Hoje, a Constituição (art. 228) diz que menores de 18 anos não respondem pelo Código Penal.',
    termos: [
      { rotulo: 'maioridade penal', re: /maioridade (civil e )?penal/ },
      { rotulo: 'inimputabilidade / imputabilidade penal', re: /imputabilidade penal/ },
      { rotulo: 'idade penal', re: /idade penal/ },
      { rotulo: 'responsabilidade penal de menores ou adolescentes', re: /responsabilidade penal d[eo]s? (menor|menores|adolescente|adolescentes|jovem|jovens)/ },
      { rotulo: 'art. 228 da Constituição', re: /(?=[\s\S]*\bart(?:igo|\.)?\s*228\b)(?=[\s\S]*constituicao)/ },
    ],
  },
  {
    id: 'escala-6x1',
    titulo: 'Escala 6×1 e jornada de trabalho',
    explicacao: 'Propostas sobre dias de trabalho, descanso e limite de horas. A escala 6×1 é a de quem trabalha seis dias e folga um. Inclui propostas sobre a jornada de trabalho em geral e também as de categorias específicas.',
    termos: [
      { rotulo: 'escala 6×1', re: /\b6\s*[x×]\s*1\b/ },
      { rotulo: 'escala 4×3 ou 5×2', re: /\b(4\s*[x×]\s*3|5\s*[x×]\s*2)\b/ },
      { rotulo: 'escala de trabalho', re: /escalas? de trabalho/ },
      { rotulo: 'jornada de trabalho', re: /jornadas? de trabalho/ },
      { rotulo: 'jornada semanal', re: /jornada semanal/ },
      { rotulo: 'semana de trabalho', re: /semana de trabalho/ },
      { rotulo: 'dias de trabalho por semana', re: /\b(quatro|4|cinco|5|seis|6) dias (de trabalho|por semana|na semana|semanais)/ },
      { rotulo: 'duração do trabalho', re: /duracao (do|de) trabalho/ },
      { rotulo: 'repouso ou folga semanal', re: /(repouso semanal|folgas? semanais?)/ },
      { rotulo: 'horas semanais', re: /horas semanais/ },
      { rotulo: 'carga horária de trabalho', re: /carga horaria (semanal|de trabalho)/ },
      { rotulo: 'art. 7º, inciso XIII, da Constituição', re: /art(?:igo|\.)?\s*7[ºo°]?,?\s*(inciso\s*)?xiii\b|inciso xiii do art(?:igo|\.)?\s*7/ },
    ],
  },
];

// Devolve os temas em que a ementa se encaixa, com os motivos (rótulos das palavras encontradas).
export function classificar(ementa) {
  const texto = normalizar(ementa);
  if (!texto) return [];
  const encontrados = [];
  for (const tema of TEMAS) {
    const motivos = tema.termos.filter(termo => termo.re.test(texto)).map(termo => termo.rotulo);
    if (motivos.length) encontrados.push({ tema, motivos });
  }
  return encontrados;
}

// Agrupa as propostas por tema. Uma proposta pode aparecer em mais de um tema.
// Todos os temas são devolvidos, mesmo sem propostas, para que a ausência seja informada.
export function agruparPorTema(propostas) {
  const grupos = TEMAS.map(tema => ({ tema, itens: [] }));
  for (const proposta of propostas) {
    for (const { tema, motivos } of classificar(proposta.ementa)) {
      grupos.find(grupo => grupo.tema.id === tema.id).itens.push({ proposta, motivos });
    }
  }
  return grupos;
}

// '2026-08-12T17:17' -> '12/08/2026' (sem conversão de fuso horário).
export function formatarData(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

// Texto da participação do deputado, sem concluir posição sobre o tema.
export function descreverPapel({ papel, proponentes }) {
  if (papel === 'autor') return 'Autor(a): consta como único(a) proponente desta proposta.';
  if (papel === 'coautor') return `Coautor(a): consta entre os ${proponentes} proponentes desta proposta.`;
  if (papel === 'apoio') return 'Assinou em apoio: o nome está na lista de assinaturas, mas não consta como proponente.';
  return 'Não foi possível identificar a participação na lista oficial de autores.';
}

export const TIPOS = {
  PEC: { nome: 'Proposta de Emenda à Constituição', explicacao: 'muda o texto da Constituição' },
  PL: { nome: 'Projeto de Lei', explicacao: 'cria ou muda uma lei' },
  PLP: { nome: 'Projeto de Lei Complementar', explicacao: 'cria ou muda uma lei que detalha a Constituição' },
  PDL: { nome: 'Projeto de Decreto Legislativo', explicacao: 'trata de assuntos de competência do Congresso, como aprovar tratados' },
};

// Explicações simples apenas para situações cujo significado é inequívoco.
const SITUACOES = {
  'tramitando em conjunto': 'está sendo analisada junto com outra proposta principal sobre assunto parecido.',
  'arquivada': 'a tramitação foi encerrada (arquivamento).',
  'transformado em norma juridica': 'virou lei ou emenda constitucional.',
};

export function explicarSituacao(situacao) {
  return SITUACOES[normalizar(situacao)] ?? null;
}
