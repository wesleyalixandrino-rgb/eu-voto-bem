export const API = 'https://dadosabertos.camara.leg.br/api/v2/deputados';

export function searchUrl(name, page = 1) {
  const normalized = name.trim();
  if (normalized.length < 2 || normalized.length > 100) {
    throw new Error('Digite entre 2 e 100 caracteres para buscar.');
  }
  if (!Number.isSafeInteger(page) || page < 1) throw new Error('Página inválida.');
  const url = new URL(API);
  url.search = new URLSearchParams({
    nome: normalized, pagina: String(page), itens: '12', ordem: 'ASC', ordenarPor: 'nome',
  });
  return url.href;
}

export function officialPhoto(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.camara.leg.br'
      && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export async function searchDeputies(name, page, { signal, fetcher = fetch } = {}) {
  const url = searchUrl(name, page);
  const response = await fetcher(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(response.status === 429
      ? 'A Câmara recebeu muitas consultas. Aguarde um pouco e tente novamente.'
      : 'Não foi possível consultar a Câmara agora. Tente novamente em instantes.');
  }
  let payload;
  try { payload = await response.json(); }
  catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('A fonte retornou dados inesperados. Tente novamente mais tarde.');
  }
  if (!payload || !Array.isArray(payload.dados) || !Array.isArray(payload.links)
    || !payload.dados.every(d => d && Number.isSafeInteger(d.id) && d.id > 0 && typeof d.nome === 'string')) {
    throw new Error('A fonte retornou dados inesperados. Tente novamente mais tarde.');
  }
  return {
    deputies: payload.dados,
    hasNext: payload.links.some(link => link?.rel === 'next'),
    url, receivedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Perfil do deputado e propostas (usados em deputado.html)
// ---------------------------------------------------------------------------

export const PROPOSALS_API = 'https://dadosabertos.camara.leg.br/api/v2/proposicoes';
// Início da 57ª legislatura (a atual). Só propostas apresentadas a partir daqui são consideradas.
export const LEGISLATURE_START = '2023-02-01';
export const PROPOSAL_TYPES = ['PEC', 'PL', 'PLP', 'PDL'];
export const MAX_PROPOSAL_PAGES = 15;
const UNEXPECTED = 'A fonte retornou dados inesperados. Tente novamente mais tarde.';

function assertId(id) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Identificador inválido.');
}

async function fetchJson(url, { signal, fetcher = fetch } = {}) {
  const response = await fetcher(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(response.status === 429
      ? 'A Câmara recebeu muitas consultas. Aguarde um pouco e tente novamente.'
      : response.status === 404
        ? 'Registro não encontrado na Câmara dos Deputados.'
        : 'Não foi possível consultar a Câmara agora. Tente novamente em instantes.');
  }
  try { return await response.json(); }
  catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error(UNEXPECTED);
  }
}

const text = value => (typeof value === 'string' && value.trim() ? value.trim() : null);

// Lê o id de um deputado a partir do parâmetro da página (somente dígitos).
export function parseDeputyId(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,8}$/.test(value)) return null;
  return Number(value);
}

export function deputyUrl(id) {
  assertId(id);
  return `${API}/${id}`;
}

// Mantém somente campos públicos de interesse. A resposta oficial inclui dados
// pessoais (CPF, nascimento, nome civil) que não são exibidos nem repassados.
export async function getDeputy(id, options) {
  const url = deputyUrl(id);
  const payload = await fetchJson(url, options);
  const dados = payload?.dados;
  const status = dados?.ultimoStatus;
  if (!dados || dados.id !== id || !status || typeof status !== 'object') throw new Error(UNEXPECTED);
  const nome = text(status.nomeEleitoral) ?? text(status.nome);
  if (!nome) throw new Error(UNEXPECTED);
  const gabinete = status.gabinete && typeof status.gabinete === 'object' ? status.gabinete : {};
  return {
    deputy: {
      id, nome,
      partido: text(status.siglaPartido),
      uf: text(status.siglaUf),
      situacao: text(status.situacao),
      condicaoEleitoral: text(status.condicaoEleitoral),
      legislatura: Number.isSafeInteger(status.idLegislatura) ? status.idLegislatura : null,
      foto: officialPhoto(status.urlFoto),
      email: text(gabinete.email) ?? text(status.email),
      telefone: text(gabinete.telefone),
      gabinete: [text(gabinete.predio) && `prédio ${gabinete.predio.trim()}`,
        text(gabinete.andar) && `andar ${gabinete.andar.trim()}`,
        text(gabinete.sala) && `sala ${gabinete.sala.trim()}`].filter(Boolean).join(', ') || null,
    },
    url, receivedAt: new Date(),
  };
}

export function proposalsUrl(deputyId, page = 1) {
  assertId(deputyId);
  if (!Number.isSafeInteger(page) || page < 1) throw new Error('Página inválida.');
  const url = new URL(PROPOSALS_API);
  url.search = new URLSearchParams({
    idDeputadoAutor: String(deputyId), siglaTipo: PROPOSAL_TYPES.join(','),
    dataApresentacaoInicio: LEGISLATURE_START, itens: '100',
    ordem: 'DESC', ordenarPor: 'id', pagina: String(page),
  });
  return url.href;
}

function validProposal(p) {
  return p && Number.isSafeInteger(p.id) && p.id > 0 && typeof p.siglaTipo === 'string'
    && Number.isSafeInteger(p.numero) && Number.isSafeInteger(p.ano)
    && typeof p.ementa === 'string'
    && (p.dataApresentacao == null || typeof p.dataApresentacao === 'string');
}

// Lista as propostas em que o deputado consta entre os autores (inclui quem apenas assinou).
export async function listProposals(deputyId, options = {}) {
  const items = [];
  let truncated = false;
  let pages = 0;
  for (let page = 1; page <= MAX_PROPOSAL_PAGES; page++) {
    const payload = await fetchJson(proposalsUrl(deputyId, page), options);
    if (!payload || !Array.isArray(payload.dados) || !Array.isArray(payload.links)
      || !payload.dados.every(validProposal)) throw new Error(UNEXPECTED);
    pages = page;
    for (const p of payload.dados) {
      // Salvaguarda: ignora propostas apresentadas antes da legislatura atual.
      if (typeof p.dataApresentacao === 'string' && p.dataApresentacao.slice(0, 10) < LEGISLATURE_START) continue;
      items.push({
        id: p.id, tipo: p.siglaTipo, numero: p.numero, ano: p.ano,
        ementa: p.ementa.trim(), apresentacao: text(p.dataApresentacao),
      });
    }
    if (!payload.links.some(link => link?.rel === 'next')) break;
    if (page === MAX_PROPOSAL_PAGES) truncated = true;
  }
  return { proposals: items, truncated, pages, url: proposalsUrl(deputyId, 1), receivedAt: new Date() };
}

// Somente páginas oficiais da Câmara são aceitas como link de inteiro teor.
export function officialLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'www.camara.leg.br' || url.hostname === 'camara.leg.br')
      && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function proposalPageUrl(id) {
  assertId(id);
  return `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${id}`;
}

export function proposalApiUrl(id) {
  assertId(id);
  return `${PROPOSALS_API}/${id}`;
}

export async function getProposalStatus(id, options) {
  const payload = await fetchJson(proposalApiUrl(id), options);
  const dados = payload?.dados;
  if (!dados || dados.id !== id) throw new Error(UNEXPECTED);
  const status = dados.statusProposicao && typeof dados.statusProposicao === 'object' ? dados.statusProposicao : {};
  return {
    situacao: text(status.descricaoSituacao),
    tramitacao: text(status.descricaoTramitacao),
    orgao: text(status.siglaOrgao),
    atualizadoEm: text(status.dataHora),
    tipoNome: text(dados.descricaoTipo),
    inteiroTeor: officialLink(dados.urlInteiroTeor),
  };
}

// Papel do deputado na proposta, conforme a lista oficial de autores:
// 'autor' (único proponente), 'coautor' (um entre vários proponentes),
// 'apoio' (assinou, mas não consta como proponente) ou 'desconhecido'.
export async function getParticipation(proposalId, deputyId, options) {
  assertId(deputyId);
  const payload = await fetchJson(`${proposalApiUrl(proposalId)}/autores`, options);
  if (!payload || !Array.isArray(payload.dados)) throw new Error(UNEXPECTED);
  const authors = payload.dados.map(a => ({
    id: Number(String(a?.uri ?? '').match(/\/deputados\/([0-9]+)$/)?.[1]) || null,
    proponente: a?.proponente,
  }));
  const proponents = authors.filter(a => a.proponente === 1).length;
  const mine = authors.find(a => a.id === deputyId);
  let papel = 'desconhecido';
  if (mine?.proponente === 1) papel = proponents > 1 ? 'coautor' : 'autor';
  else if (mine?.proponente === 0) papel = 'apoio';
  return { papel, proponentes: proponents, assinaturas: authors.length };
}
