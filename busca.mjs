import { API, officialPhoto, searchDeputies, searchUrl } from './camara.mjs';

const $ = id => document.getElementById(id);
let controller;
let requestNumber = 0;
let currentName = '';
let currentPage = 1;

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

function deputyCard(deputy) {
  const item = node('li', undefined, 'person');
  const portrait = node('div', undefined, 'portrait');
  const fallback = () => portrait.replaceChildren(node('span', 'Foto indisponível'));
  const photo = officialPhoto(deputy.urlFoto);
  if (photo) {
    const image = node('img');
    image.alt = `Foto de ${deputy.nome}`;
    image.loading = 'lazy';
    image.addEventListener('error', fallback, { once: true });
    image.src = photo;
    portrait.append(image);
  } else fallback();
  const info = node('div');
  info.append(
    node('h3', deputy.nome),
    node('p', 'Deputado(a) federal'),
    node('p', `Partido: ${deputy.siglaPartido || 'não informado'} · UF: ${deputy.siglaUf || 'não informada'}`),
    link('Ver perfil detalhado na Câmara', `https://www.camara.leg.br/deputados/${deputy.id}`),
    link('Dados oficiais deste parlamentar', `${API}/${deputy.id}`),
  );
  item.append(portrait, info);
  return item;
}

async function search(name, page) {
  controller?.abort();
  const number = ++requestNumber;
  controller = new AbortController();
  const activeController = controller;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; activeController.abort(); }, 20000);
  $('lista').replaceChildren();
  $('paginacao').hidden = true;
  $('consulta-link').hidden = true;
  $('consulta-data').textContent = 'Consulta em andamento; aguardando resposta da fonte.';
  $('resultados').setAttribute('aria-busy', 'true');
  $('status').textContent = 'Buscando na Câmara dos Deputados…';
  try {
    const result = await searchDeputies(name, page, { signal: activeController.signal });
    if (number !== requestNumber) return;
    currentName = name;
    currentPage = page;
    $('lista').replaceChildren(...result.deputies.map(deputyCard));
    $('status').textContent = result.deputies.length
      ? `${result.deputies.length} resultado(s) nesta página para “${name}”.`
      : `Nenhum deputado encontrado para “${name}” na legislatura atual. Tente parte do nome ou outra grafia.`;
    $('consulta-data').textContent = `Resposta recebida em ${result.receivedAt.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium',
    })} (horário de Brasília). Consulta à API; não é uma base mensal consolidada.`;
    $('consulta-link').href = result.url;
    $('consulta-link').hidden = false;
    $('pagina').textContent = `Página ${page}`;
    $('anterior').disabled = page === 1;
    $('proxima').disabled = !result.hasNext;
    $('paginacao').hidden = page === 1 && !result.hasNext;
  } catch (error) {
    if (number !== requestNumber) return;
    $('status').textContent = timedOut
      ? 'A Câmara demorou a responder. Tente buscar novamente.'
      : error.name === 'TypeError'
        ? 'Não foi possível conectar à Câmara. Verifique sua conexão e tente novamente.'
        : error.message;
    $('consulta-data').textContent = 'Consulta não concluída. Nenhuma data de atualização foi atribuída.';
  } finally {
    clearTimeout(timeout);
    if (number === requestNumber) $('resultados').setAttribute('aria-busy', 'false');
  }
}

$('busca').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('nome').value.trim();
  try {
    searchUrl(name);
    $('nome').setCustomValidity('');
    search(name, 1);
  } catch (error) {
    $('nome').setCustomValidity(error.message);
    $('nome').reportValidity();
  }
});
$('nome').addEventListener('input', () => $('nome').setCustomValidity(''));
$('anterior').addEventListener('click', () => search(currentName, currentPage - 1));
$('proxima').addEventListener('click', () => search(currentName, currentPage + 1));
