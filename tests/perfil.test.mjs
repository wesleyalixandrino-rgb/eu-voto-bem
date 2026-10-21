import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDeputy, getParticipation, getProposalStatus, listProposals, officialLink,
  parseDeputyId, proposalsUrl, MAX_PROPOSAL_PAGES,
} from '../camara.mjs';
import {
  agruparPorTema, classificar, descreverPapel, explicarSituacao, formatarData,
} from '../temas.mjs';

const ok = body => async () => ({ ok: true, json: async () => body });
const temas = ementa => classificar(ementa).map(item => item.tema.id);

// Ementas reais retornadas pela API de Dados Abertos da Câmara.
const MAIORIDADE_2026 = 'Altera o art. 228 da Constituição Federal para admitir, em caráter excepcional, a redução da maioridade penal em casos de crimes hediondos e de crueldade extrema contra pessoas e animais.';
const MAIORIDADE_2015 = 'Altera a redação dos artigos 14 e 228 da Constituição Federal, para estabelecer a plena maioridade civil e penal aos dezesseis anos de idade.';
const JORNADA_2019 = 'Altera o Art. 7º inciso XII da constituição Federal, reduzindo a jornada de trabalho a 36 horas semanais em 10 anos.';
const JORNADA_2025 = 'Altera o inciso XIII do art. 7º da Constituição Federal para tratar da redução da jornada de trabalho para quatro dias por semana.';
const CULTURA = 'Inclui a cultura entre os direitos sociais do art. 6º da Constituição Federal.';

test('identifica maioridade penal nas ementas reais, com o motivo', () => {
  assert.deepEqual(temas(MAIORIDADE_2026), ['maioridade-penal']);
  assert.deepEqual(temas(MAIORIDADE_2015), ['maioridade-penal']);
  const [{ motivos }] = classificar(MAIORIDADE_2026);
  assert.ok(motivos.includes('maioridade penal'));
  assert.ok(motivos.includes('art. 228 da Constituição'));
});

test('identifica jornada e escala, mesmo sem citar 6x1', () => {
  assert.deepEqual(temas(JORNADA_2019), ['escala-6x1']);
  assert.deepEqual(temas(JORNADA_2025), ['escala-6x1']);
  assert.deepEqual(temas('Dispõe sobre o fim da escala 6×1 e institui a escala 4x3.'), ['escala-6x1']);
  assert.deepEqual(temas('Veda a escala de trabalho 6x1 no comércio.'), ['escala-6x1']);
});

test('não classifica propostas sem relação com os temas', () => {
  assert.deepEqual(temas(CULTURA), []);
  assert.deepEqual(temas('Dispõe sobre o imposto sobre produtos industrializados.'), []);
  assert.deepEqual(temas(''), []);
  assert.deepEqual(temas(undefined), []);
});

test('agrupa por tema e devolve todos os temas, inclusive vazios', () => {
  const grupos = agruparPorTema([
    { id: 1, ementa: MAIORIDADE_2026 }, { id: 2, ementa: JORNADA_2025 }, { id: 3, ementa: CULTURA },
  ]);
  assert.deepEqual(grupos.map(g => [g.tema.id, g.itens.length]), [['maioridade-penal', 1], ['escala-6x1', 1]]);
  assert.deepEqual(agruparPorTema([]).map(g => g.itens.length), [0, 0]);
});

test('datas e situações em português simples, sem inventar explicações', () => {
  assert.equal(formatarData('2026-08-12T17:17'), '12/08/2026');
  assert.equal(formatarData(null), null);
  assert.match(explicarSituacao('Tramitando em Conjunto'), /junto com outra proposta/);
  assert.equal(explicarSituacao('Aguardando Designação de Relator'), null);
});

test('texto da participação nunca fala em voto', () => {
  for (const papel of ['autor', 'coautor', 'apoio', 'desconhecido']) {
    const texto = descreverPapel({ papel, proponentes: 3 });
    assert.ok(texto.length > 10);
    assert.doesNotMatch(texto, /votou|a favor|contra/i);
  }
  assert.match(descreverPapel({ papel: 'coautor', proponentes: 3 }), /3 proponentes/);
});

test('id do deputado aceita somente números inteiros positivos', () => {
  assert.equal(parseDeputyId('220645'), 220645);
  for (const value of ['', '0', '-1', '12a', '../x', '1e3', '0123', ' 5', '9999999999', null, undefined]) {
    assert.equal(parseDeputyId(value), null, String(value));
  }
});

test('URL das propostas usa o autor, os tipos e a legislatura atual', () => {
  const url = new URL(proposalsUrl(220645, 2));
  assert.equal(url.searchParams.get('idDeputadoAutor'), '220645');
  assert.equal(url.searchParams.get('siglaTipo'), 'PEC,PL,PLP,PDL');
  assert.equal(url.searchParams.get('dataApresentacaoInicio'), '2023-02-01');
  assert.equal(url.searchParams.get('pagina'), '2');
  assert.throws(() => proposalsUrl('1&x=2'));
  assert.throws(() => proposalsUrl(5, 0));
});

test('perfil mantém apenas campos públicos e descarta dados pessoais', async () => {
  const body = { dados: {
    id: 220645, cpf: '00000000000', dataNascimento: '1990-01-01', nomeCivil: 'Nome Civil Privado',
    ultimoStatus: {
      nomeEleitoral: 'Nome Eleitoral', siglaPartido: 'XX', siglaUf: 'SP', situacao: 'Exercício',
      condicaoEleitoral: 'Titular', idLegislatura: 57,
      urlFoto: 'https://www.camara.leg.br/internet/deputado/bandep/220645.jpg',
      gabinete: { predio: '4', andar: '6', sala: '636', telefone: '3215-0000', email: 'dep.teste@camara.leg.br' },
    },
  } };
  const { deputy } = await getDeputy(220645, { fetcher: ok(body) });
  assert.equal(deputy.nome, 'Nome Eleitoral');
  assert.equal(deputy.gabinete, 'prédio 4, andar 6, sala 636');
  assert.equal(deputy.email, 'dep.teste@camara.leg.br');
  assert.equal(deputy.foto, 'https://www.camara.leg.br/internet/deputado/bandep/220645.jpg');
  const serializado = JSON.stringify(deputy);
  assert.doesNotMatch(serializado, /00000000000|1990-01-01|Nome Civil Privado/);
});

test('perfil rejeita resposta de outro deputado, incompleta ou com erro HTTP', async () => {
  const status = { nomeEleitoral: 'X' };
  await assert.rejects(getDeputy(1, { fetcher: ok({ dados: { id: 2, ultimoStatus: status } }) }), /dados inesperados/);
  await assert.rejects(getDeputy(1, { fetcher: ok({ dados: { id: 1 } }) }), /dados inesperados/);
  await assert.rejects(getDeputy(1, { fetcher: ok({ dados: { id: 1, ultimoStatus: {} } }) }), /dados inesperados/);
  await assert.rejects(getDeputy(1, { fetcher: async () => ({ ok: false, status: 404 }) }), /não encontrado/);
  await assert.rejects(getDeputy(1, { fetcher: async () => ({ ok: false, status: 429 }) }), /muitas consultas/);
  await assert.rejects(getDeputy(1, { fetcher: async () => ({ ok: false, status: 500 }) }), /Não foi possível/);
});

test('foto de fora do domínio oficial é descartada no perfil', async () => {
  const body = { dados: { id: 1, ultimoStatus: { nomeEleitoral: 'X', urlFoto: 'https://evil.test/a.jpg' } } };
  assert.equal((await getDeputy(1, { fetcher: ok(body) })).deputy.foto, null);
});

test('lista propostas em várias páginas e ignora as anteriores à legislatura', async () => {
  const calls = [];
  const pages = [
    { dados: [
      { id: 3, siglaTipo: 'PL', numero: 3, ano: 2025, ementa: ' C ', dataApresentacao: '2025-01-01T10:00' },
      { id: 2, siglaTipo: 'PEC', numero: 2, ano: 2022, ementa: 'B', dataApresentacao: '2022-12-31T10:00' },
    ], links: [{ rel: 'next' }] },
    { dados: [{ id: 1, siglaTipo: 'PLP', numero: 1, ano: 2023, ementa: 'A', dataApresentacao: '2023-02-01T00:00' }], links: [] },
  ];
  const result = await listProposals(9, { fetcher: async url => {
    calls.push(new URL(url).searchParams.get('pagina'));
    return { ok: true, json: async () => pages[calls.length - 1] };
  } });
  assert.deepEqual(calls, ['1', '2']);
  assert.deepEqual(result.proposals.map(p => p.id), [3, 1]);
  assert.equal(result.proposals[0].ementa, 'C');
  assert.equal(result.truncated, false);
});

test('limita o número de páginas e avisa que o resultado pode estar incompleto', async () => {
  let calls = 0;
  const result = await listProposals(9, { fetcher: async () => {
    calls++;
    return { ok: true, json: async () => ({ dados: [], links: [{ rel: 'next' }] }) };
  } });
  assert.equal(calls, MAX_PROPOSAL_PAGES);
  assert.equal(result.truncated, true);
});

test('lista de propostas rejeita resposta inválida e propaga falhas', async () => {
  const invalid = [null, {}, { dados: [{ id: 'x' }], links: [] }, { dados: [], links: null }];
  for (const body of invalid) await assert.rejects(listProposals(9, { fetcher: ok(body) }), /dados inesperados/);
  await assert.rejects(listProposals(9, { fetcher: async () => ({ ok: false, status: 503 }) }), /Não foi possível/);
});

test('participação distingue autor, coautor e apoio conforme a lista oficial', async () => {
  const uri = id => `https://dadosabertos.camara.leg.br/api/v2/deputados/${id}`;
  const lista = [
    { uri: uri(10), proponente: 1 }, { uri: uri(11), proponente: 1 },
    { uri: uri(12), proponente: 0 }, { uri: 'https://dadosabertos.camara.leg.br/api/v2/orgaos/4', proponente: 1 },
  ];
  const fetcher = ok({ dados: lista });
  assert.equal((await getParticipation(5, 10, { fetcher })).papel, 'coautor');
  assert.equal((await getParticipation(5, 12, { fetcher })).papel, 'apoio');
  assert.equal((await getParticipation(5, 99, { fetcher })).papel, 'desconhecido');
  const unico = ok({ dados: [{ uri: uri(10), proponente: 1 }, { uri: uri(12), proponente: 0 }] });
  assert.equal((await getParticipation(5, 10, { fetcher: unico })).papel, 'autor');
  await assert.rejects(getParticipation(5, 10, { fetcher: ok({}) }), /dados inesperados/);
});

test('situação da proposta usa só o que a fonte informa e links oficiais', async () => {
  const body = { dados: { id: 7, descricaoTipo: 'Proposta de Emenda à Constituição',
    urlInteiroTeor: 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=1',
    statusProposicao: { descricaoSituacao: 'Tramitando em Conjunto', descricaoTramitacao: 'Notificação', siglaOrgao: 'PEC', dataHora: '2026-08-12T17:17' } } };
  const info = await getProposalStatus(7, { fetcher: ok(body) });
  assert.equal(info.situacao, 'Tramitando em Conjunto');
  assert.equal(info.inteiroTeor, 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=1');
  const semStatus = await getProposalStatus(7, { fetcher: ok({ dados: { id: 7, urlInteiroTeor: 'javascript:alert(1)' } }) });
  assert.equal(semStatus.situacao, null);
  assert.equal(semStatus.inteiroTeor, null);
  await assert.rejects(getProposalStatus(7, { fetcher: ok({ dados: { id: 8 } }) }), /dados inesperados/);
});

test('links de inteiro teor só são aceitos no domínio oficial por HTTPS', () => {
  for (const value of [null, '', 'http://www.camara.leg.br/a', 'https://camara.leg.br.evil.test/a', 'https://user@www.camara.leg.br/a', 'javascript:alert(1)']) {
    assert.equal(officialLink(value), null, String(value));
  }
  assert.ok(officialLink('https://www.camara.leg.br/a'));
});
