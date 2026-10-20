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

Processos por tema, condenações definitivas, absolvições, anulações, STF/relatoria,
projetos legislativos e votações ainda não estão integrados.

## Executar e testar

Com Python instalado, execute na pasta do projeto:

```sh
python -m http.server 4174 --bind 127.0.0.1
```

Abra http://127.0.0.1:4174 (os módulos JavaScript precisam de um servidor HTTP).
Com Node.js 18 ou superior:

```sh
node --test tests/camara.test.mjs
```

Teste manual: buscar um nome, navegar entre páginas, buscar nome inexistente,
verificar fontes e perfil, conferir em tela estreita e simular falha de conexão.

## Cloudflare Pages

Preservar a conexão GitHub e as configurações existentes. Não há etapa de build.
Os arquivos `index.html`, `busca.css`, `busca.mjs` e `camara.mjs` precisam estar
juntos no diretório publicado (raiz do repositório).
Publicar somente após aprovação da responsável; um envio à branch de produção
pode disparar automaticamente a publicação no Pages.

## Fonte

- https://dadosabertos.camara.leg.br/
- https://dadosabertos.camara.leg.br/swagger/api.html
- Endpoint: `https://dadosabertos.camara.leg.br/api/v2/deputados`

Os nomes são inseridos na página como texto, não como HTML. Fotos são aceitas
somente por HTTPS no domínio oficial da Câmara. Falhas não geram dados fictícios.
