import {
  LEGISLATURE_START, PROPOSAL_TYPES, getDeputy, getParticipation, getProposalStatus,
  listProposals, parseDeputyId, proposalApiUrl, proposalPageUrl,
} from './camara.mjs';
import {
  TIPOS, agruparPorTema, descreverPapel, explicarSituacao, formatarData,
} from './temas.mjs';

const $ = id => document.getElementById(id);
const CONCURRENCY = 4;
let runNumber = 0;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function link(text, href) {
  const element = node('a', text);
  element.href = href;
  return element;
}

function formatarRecebimento(date) {
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' });
}

function describeError(error, timedOut) {
  if (timedOut || error.name === 'TimeoutError') return 'A Câmara demorou a responder. Tente novamente.';
  if (error.name === 'TypeError') return 'Não foi possível conectar à Câmara. Verifique sua conexão e tente novamente.';
  return error.message;
}

function renderProfile(deputy, result) {
  document.title = `${deputy.nome} | Eu voto bem?`;
  $('perfil-nome').textContent = deputy.nome;
  const portrait = $('perfil-foto');
  const fallback = () => portrait.replaceChildren(node('span', 'Foto indisponível'));
  if (deputy.foto) {
    const image = node('img');
    image.alt = `Foto de ${deputy.nome}`;
    image.addEventListener('error', fallback, { once: true });
    image.src = deputy.foto;
    portrait.replaceChildren(image);
  } else fallback();
  $('perfil-partido').textContent = `Partido: ${deputy.partido ?? 'não informado'} · UF: ${deputy.uf ?? 'não informada'}`;
  $('perfil-mandato').textContent = `Situação do mandato: ${deputy.situacao ?? 'não informada'}`
    + (deputy.condicaoEleitoral ? ` · Condição: ${deputy.condicaoEleitoral}` : '');
  $('perfil-gabinete').textContent = deputy.gabinete ? `Gabinete: ${deputy.gabinete}` : '';
  $('perfil-gabinete').hidden = !deputy.gabinete;

  const contact = $('perfil-contato');
  contact.replaceChildren();
  if (deputy.email) {
    contact.append(document.createTextNode('E-mail oficial: '));
    contact.append(/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(deputy.email)
      ? link(deputy.email, `mailto:${deputy.email}`)
      : document.createTextNode(deputy.email));
  }
  if (deputy.telefone) {
    if (deputy.email) contact.append(node('br'));
    contact.append(document.createTextNode(`Telefone do gabinete: ${deputy.telefone}`));
  }
  contact.hidden = !deputy.email && !deputy.telefone;

  $('perfil-camara').href = `https://www.camara.leg.br/deputados/${deputy.id}`;
  $('perfil-api').href = result.url;
  $('perfil-data').textContent = `Dados recebidos em ${formatarRecebimento(result.receivedAt)} (horário de Brasília). `
    + 'Consulta direta à API da Câmara; não é uma base mensal consolidada.';
  $('perfil').hidden = false;
}

function proposalCard(item) {
  const { proposta, motivos } = item;
  const tipo = TIPOS[proposta.tipo];
  const card = node('li', undefined, 'proposta');
  const title = node('h4', `${proposta.tipo} ${proposta.numero}/${proposta.ano}`);
  if (tipo) title.append(node('span', `${tipo.nome} — ${tipo.explicacao}`, 'tipo'));
  const ementa = node('p');
  ementa.append(node('strong', 'Resumo oficial (ementa): '), document.createTextNode(proposta.ementa));
  const reason = node('p', `Por que aparece neste tema: o resumo oficial menciona ${motivos.map(m => `“${m}”`).join(', ')}.`, 'motivo');
  const role = node('p', 'Participação do deputado: carregando…', 'pendente');
  const status = node('p', 'Situação na Câmara: carregando…', 'pendente');
  card.append(title, ementa, reason, role, status);
  const date = formatarData(proposta.apresentacao);
  if (date) card.append(node('p', `Apresentada em ${date}.`));
  const links = node('p', undefined, 'links');
  links.append(
    link('Ver proposta na Câmara', proposalPageUrl(proposta.id)),
    link('Dados oficiais desta proposta', proposalApiUrl(proposta.id)),
  );
  card.append(links);
  return { card, role, status, links };
}

function fillStatus(refs, info) {
  refs.status.className = '';
  const date = formatarData(info.atualizadoEm);
  const gloss = info.situacao ? explicarSituacao(info.situacao) : null;
  let line = `Situação na Câmara: ${info.situacao ?? 'não informada'}`;
  if (gloss) line += ` (${gloss.replace(/\.$/, '')})`;
  if (info.tramitacao) {
    line += `. Última movimentação: ${info.tramitacao}`;
    if (date) line += ` em ${date}`;
    if (info.orgao) line += `, órgão ${info.orgao}`;
  }
  refs.status.textContent = `${line}.`;
  if (info.inteiroTeor) refs.links.insertBefore(link('Texto integral', info.inteiroTeor), refs.links.children[1]);
}

async function runLimited(tasks, limit) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) await tasks[next++]();
  });
  await Promise.all(workers);
}

async function enrich(deputyId, groups, number) {
  const cards = new Map(); // id da proposta -> { refs, resultado }
  const tasks = [];
  for (const group of groups) {
    const list = $(`lista-${group.tema.id}`);
    const itens = [];
    for (const item of group.itens) {
      const refs = proposalCard(item);
      itens.push(refs.card);
      if (!cards.has(item.proposta.id)) cards.set(item.proposta.id, { refsList: [], papel: null, ok: true });
      cards.get(item.proposta.id).refsList.push(refs);
    }
    list?.replaceChildren(...itens);
  }
  for (const [id, entry] of cards) {
    tasks.push(async () => {
      if (number !== runNumber) return;
      const [statusResult, roleResult] = await Promise.allSettled([
        getProposalStatus(id, { signal: AbortSignal.timeout(30000) }),
        getParticipation(id, deputyId, { signal: AbortSignal.timeout(30000) }),
      ]);
      if (number !== runNumber) return;
      for (const refs of entry.refsList) {
        if (statusResult.status === 'fulfilled') fillStatus(refs, statusResult.value);
        else { refs.status.className = ''; refs.status.textContent = 'Situação na Câmara: não foi possível carregar agora. Consulte o link oficial.'; }
        if (roleResult.status === 'fulfilled') {
          refs.role.className = 'papel';
          refs.role.textContent = descreverPapel(roleResult.value);
        } else {
          refs.role.className = '';
          refs.role.textContent = 'Participação do deputado: não foi possível carregar agora. Consulte o link oficial.';
        }
      }
      entry.papel = roleResult.status === 'fulfilled' ? roleResult.value.papel : null;
    });
  }
  await runLimited(tasks, CONCURRENCY);
  if (number !== runNumber) return;
  // Resumo por tema, somente se todas as participações foram carregadas.
  for (const group of groups) {
    const papeis = group.itens.map(item => cards.get(item.proposta.id).papel);
    if (!papeis.length || papeis.some(papel => papel === null)) continue;
    const propositor = papeis.filter(papel => papel === 'autor' || papel === 'coautor').length;
    const apoio = papeis.filter(papel => papel === 'apoio').length;
    $(`resumo-${group.tema.id}`).textContent = `${group.itens.length} proposta(s): ${propositor} como autor(a) ou coautor(a), ${apoio} apenas com assinatura de apoio`
      + (papeis.length - propositor - apoio ? `, ${papeis.length - propositor - apoio} sem participação identificada.` : '.');
  }
}

function renderThemeShells(groups) {
  const root = $('temas-lista');
  root.replaceChildren();
  for (const group of groups) {
    const section = node('section', undefined, 'tema');
    section.setAttribute('aria-labelledby', `titulo-${group.tema.id}`);
    const heading = node('h3', group.tema.titulo);
    heading.id = `titulo-${group.tema.id}`;
    section.append(heading, node('p', group.tema.explicacao, 'tema-explicacao'));
    if (group.itens.length) {
      const summary = node('p', `${group.itens.length} proposta(s) encontrada(s).`, 'tema-resumo');
      summary.id = `resumo-${group.tema.id}`;
      const list = node('ul', undefined, 'propostas');
      list.id = `lista-${group.tema.id}`;
      section.append(summary, list);
    } else {
      section.append(node('p',
        'Não encontramos propostas deste deputado sobre este tema no resumo oficial das propostas analisadas. '
        + 'Isso não significa que ele seja contra ou a favor do tema.', 'tema-vazio'));
    }
    root.append(section);
  }
}

async function loadThemes(deputyId, number) {
  $('temas').hidden = false;
  $('temas').setAttribute('aria-busy', 'true');
  $('temas-lista').replaceChildren();
  $('temas-escopo').textContent = '';
  $('temas-tentar').hidden = true;
  $('temas-status').textContent = 'Buscando propostas na Câmara…';
  try {
    const result = await listProposals(deputyId, { signal: AbortSignal.timeout(90000) });
    if (number !== runNumber) return;
    const groups = agruparPorTema(result.proposals);
    renderThemeShells(groups);
    const found = groups.reduce((sum, group) => sum + group.itens.length, 0);
    $('temas-status').textContent = `${result.proposals.length} proposta(s) analisada(s); ${found} sobre os temas abaixo.`;
    $('temas-escopo').textContent = `Foram analisadas as propostas dos tipos ${PROPOSAL_TYPES.join(', ')} apresentadas desde `
      + `${formatarData(LEGISLATURE_START)} (início da legislatura atual) em que o deputado consta entre os autores ou signatários. `
      + 'Requerimentos, emendas e indicações não entram. O tema é identificado por palavras do resumo oficial (ementa); '
      + 'propostas que usem outras palavras podem não aparecer, e algumas podem apenas tocar no assunto. '
      + 'Confira sempre o texto oficial. '
      + (result.truncated ? 'Atenção: havia propostas demais e a lista foi limitada; o resultado pode estar incompleto. ' : '')
      + `Dados recebidos em ${formatarRecebimento(result.receivedAt)} (horário de Brasília).`;
    await enrich(deputyId, groups, number);
  } catch (error) {
    if (number !== runNumber) return;
    $('temas-status').textContent = describeError(error);
    $('temas-tentar').hidden = false;
  } finally {
    if (number === runNumber) $('temas').setAttribute('aria-busy', 'false');
  }
}

async function load() {
  const number = ++runNumber;
  const id = parseDeputyId(new URLSearchParams(location.search).get('id') ?? '');
  $('tentar-de-novo').hidden = true;
  if (!id) {
    $('status').textContent = 'Endereço inválido. Volte para a busca e escolha um deputado.';
    return;
  }
  $('status').hidden = false;
  $('status').textContent = 'Carregando dados da Câmara dos Deputados…';
  try {
    const result = await getDeputy(id, { signal: AbortSignal.timeout(30000) });
    if (number !== runNumber) return;
    $('status').hidden = true;
    renderProfile(result.deputy, result);
  } catch (error) {
    if (number !== runNumber) return;
    $('status').textContent = describeError(error);
    $('tentar-de-novo').hidden = false;
    return;
  }
  await loadThemes(id, number);
}

if (typeof document !== 'undefined' && $('perfil')) {
  $('tentar-de-novo').addEventListener('click', () => load());
  $('temas-tentar').addEventListener('click', () => {
    const id = parseDeputyId(new URLSearchParams(location.search).get('id') ?? '');
    if (id) loadThemes(id, ++runNumber);
  });
  load();
}
