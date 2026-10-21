# eu-voto-bem

Portal independente de transparência pública. Site estático, sem instalação de
dependências e sem chaves de API.

## Funcionalidade disponível

Busca por nome na legislatura atual, pela API oficial de Dados Abertos da Câmara.
Exibe cargo, partido, UF, foto quando disponível, perfil detalhado no site da
Câmara e referências oficiais. Resultados são paginados em grupos de 12.

A data exibida registra o recebimento da resposta, no horário de Brasília.
A API pode usar cache. Não existe snapshot mensal nem atualização mensal
automatizada nesta versão; essa frequência está apenas planejada.

### Perfil do deputado (`deputado.html?id=...`)

Mostra partido, UF, situação do mandato, gabinete e contato oficial, e a seção
**Atuação por tema** com propostas sobre **maioridade penal** e **escala 6×1 /
jornada de trabalho**.

- Busca as propostas dos tipos PEC, PL, PLP e PDL apresentadas desde 01/02/2023
  (início da legislatura atual) em que o deputado consta entre os autores. Requerimentos,
  emendas e indicações não entram.
- O tema é identificado por palavras do resumo oficial (ementa), definidas em
  `temas.mjs`. O método pode deixar propostas de fora ou incluir propostas que só tocam
  no assunto; a página informa isso e mostra, em cada proposta, quais palavras motivaram
  a classificação. O filtro `keywords` da API não é usado porque devolve resultados incompletos.
- A participação vem da lista oficial de autores de cada proposta: **autor(a)** (único
  proponente), **coautor(a)** (um entre vários proponentes) ou **assinou em apoio** (consta
  na lista, mas não como proponente). O filtro por autor da API também devolve quem só assinou.
- Nunca se afirma voto. Votos nominais não estão integrados.
- O CPF, a data de nascimento e o nome civil vêm na resposta do perfil oficial, mas são
  descartados e nunca exibidos (`getDeputy` em `camara.mjs` só repassa campos públicos).

Processos por tema, condenações definitivas, absolvições, anulações, STF/relatoria,
votações e outros temas (saúde, educação, segurança pública) ainda não estão integrados.

## Executar e testar

Com Python instalado, execute na pasta do projeto:

```sh
python -m http.server 4174 --bind 127.0.0.1
```

Abra http://127.0.0.1:4174 (os módulos JavaScript precisam de um servidor HTTP).
Com Node.js 18 ou superior:

```sh
node --test tests/*.test.mjs
```

Teste manual: buscar um nome, navegar entre páginas, buscar nome inexistente,
abrir o perfil de um deputado, conferir os temas, as participações e as fontes,
verificar em tela estreita e simular falha de conexão.

## Cloudflare Pages

Preservar a conexão GitHub e as configurações existentes. Não há etapa de build.
Os arquivos `index.html`, `busca.css`, `busca.mjs`, `camara.mjs`, `deputado.html`,
`deputado.css`, `deputado.mjs` e `temas.mjs` precisam estar juntos no diretório
publicado (raiz do repositório).
Publicar somente após aprovação da responsável; um envio à branch de produção
pode disparar automaticamente a publicação no Pages.

## Fonte

- https://dadosabertos.camara.leg.br/
- https://dadosabertos.camara.leg.br/swagger/api.html
- Endpoints: `https://dadosabertos.camara.leg.br/api/v2/deputados`, `.../deputados/{id}`,
  `.../proposicoes`, `.../proposicoes/{id}` e `.../proposicoes/{id}/autores`

Os nomes são inseridos na página como texto, não como HTML. Fotos são aceitas
somente por HTTPS no domínio oficial da Câmara. Falhas não geram dados fictícios.
