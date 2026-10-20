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
