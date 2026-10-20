import test from 'node:test';
import assert from 'node:assert/strict';
import { searchUrl, searchDeputies, officialPhoto } from '../camara.mjs';

test('preserva acentos e impede que o nome injete parâmetros', () => {
  const url = new URL(searchUrl(' João & pagina=99 ', 2));
  assert.equal(url.searchParams.get('nome'), 'João & pagina=99');
  assert.equal(url.searchParams.get('pagina'), '2');
  assert.equal(url.searchParams.get('itens'), '12');
  assert.throws(() => searchUrl('  '));
  assert.throws(() => searchUrl('Ana', 0));
});

test('recebe resultados e indica a existência de próxima página', async () => {
  const deputy = { id: 123, nome: 'Nome de teste' };
  const result = await searchDeputies('Nome', 1, {
    fetcher: async () => ({ ok: true, json: async () => ({
      dados: [deputy], links: [{ rel: 'next' }],
    }) }),
  });
  assert.deepEqual(result.deputies, [deputy]);
  assert.equal(result.hasNext, true);
  assert.ok(result.receivedAt instanceof Date);
});

test('resultado vazio não é erro e não inventa registros', async () => {
  const result = await searchDeputies('zzzzz', 1, {
    fetcher: async () => ({ ok: true, json: async () => ({ dados: [], links: [] }) }),
  });
  assert.deepEqual(result.deputies, []);
  assert.equal(result.hasNext, false);
});

test('erros HTTP e limite de consultas não são resultados vazios', async () => {
  for (const status of [429, 503]) {
    await assert.rejects(searchDeputies('Ana', 1, {
      fetcher: async () => ({ ok: false, status }),
    }), status === 429 ? /muitas consultas/ : /Não foi possível/);
  }
});

test('resposta inválida e identificadores incorretos são rejeitados', async () => {
  for (const payload of [null, {}, { dados: [{ id: '../foo', nome: 'Teste' }], links: [] }, {dados: [null], links: []}]) {
    await assert.rejects(searchDeputies('Ana', 1, {
      fetcher: async () => ({ ok: true, json: async () => payload }),
    }), /dados inesperados/);
  }
});

test('erro de JSON é apresentado em português', async () => {
  await assert.rejects(searchDeputies('Ana', 1, {
    fetcher: async () => ({ ok: true, json: async () => { throw new SyntaxError('Unexpected token'); } }),
  }), /dados inesperados/);
});

test('cancelamento é encaminhado ao transporte', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(searchDeputies('Ana', 1, {
    signal: controller.signal,
    fetcher: async (_, options) => { options.signal.throwIfAborted(); },
  }), { name: 'AbortError' });
});

test('foto ausente ou fora do domínio oficial utiliza alternativa', () => {
  for (const url of [null, '', 'javascript:alert(1)', 'https://www.camara.leg.br.evil.test/a.jpg']) {
    assert.equal(officialPhoto(url), null);
  }
  assert.equal(officialPhoto('https://www.camara.leg.br/internet/deputado/bandep/123.jpg'),
    'https://www.camara.leg.br/internet/deputado/bandep/123.jpg');
});
