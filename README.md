# AgendaFlow · kernel SaaS de agendamento

Primeira versão funcional de uma plataforma com **um kernel compartilhado e produtos comerciais próprios por nicho**. O estabelecimento cria conta diretamente na marca; não há seletor de segmento na interface do cliente.

| Produto de exemplo | Rota local        | Módulo                            |
| ------------------ | ----------------- | --------------------------------- |
| PetFlow            | `/b/petflow`      | Agenda + tutores + pets           |
| BarberFlow         | `/b/barberflow`   | Agenda + clientes + barbeiros     |
| BeautyFlow         | `/b/beautyflow`   | Agenda + clientes + profissionais |
| EsteticaFlow       | `/b/esteticaflow` | Agenda + clientes + profissionais |

Os nomes são provisórios, sem registro de marca/domínio. Os produtos reutilizam aplicação, API e banco. Nesta primeira versão, Salão, Barbearia e Estética usam o fluxo básico; particularidades comerciais desses nichos ainda precisam de validação.

## Executar localmente

Requisitos: **Node.js 22.12+** (validado com Node 24) e npm.

```sh
npm ci
npm run dev
```

Abra **http://localhost:5173/b/petflow**, selecione **Criar conta** e cadastre o estabelecimento. Um profissional e um serviço de exemplo são criados para iniciar a configuração. Cadastre tutor, pet e agende um horário futuro dentro do expediente. Para testar outro produto, abra sua rota em uma sessão separada.

O servidor da API fica na porta 3001. Sem `DATABASE_URL`, os dados são persistidos em `.data/pg` por PGlite. **Não apague essa pasta se quiser preservar os cadastros.** PGlite é o modo de desenvolvimento, com um processo; produção exige PostgreSQL externo.

### Demonstração opcional

Com a aplicação parada, execute:

```sh
npm run demo
npm run dev
```

O seed imprime uma senha aleatória para `ana@demo.local` e cria apenas dados fictícios. Ele não altera uma demonstração já existente. Para definir a senha inicial, configure `DEMO_PASSWORD` no seu ambiente antes da primeira execução. Nunca use a conta demo com dados reais.

### Configuração

Copie `.env.example` para `.env` se precisar mudar portas, origem, banco ou domínios. Não versione `.env`.

- `APP_ORIGIN`: origem exata do frontend. Padrão local: `http://localhost:5173`.
- `APP_ORIGINS`: lista separada por vírgulas para permitir os domínios das várias marcas.
- `DATABASE_URL`: conexão PostgreSQL; credenciais ficam exclusivamente no servidor.
- `DATA_DIR`: diretório PGlite no desenvolvimento.
- `BRAND_HOSTS`: mapa JSON domínio → marca. Em domínios configurados, a API recusa outra marca no caminho.
- `NODE_ENV=production`: exige PostgreSQL e `APP_ORIGIN` HTTPS; ativa cookie seguro e CSP.
- `HOST`: `127.0.0.1` por padrão; em container/reverse proxy configure conforme a infraestrutura.

## Tecnologias

**TypeScript** no frontend/backend, **React + Vite** na interface, **Fastify** na API, **PostgreSQL** na persistência. PGlite usa o mesmo esquema SQL no ambiente local. Autenticação por sessão revogável no banco; senhas com scrypt e salt aleatório. Valores monetários em centavos e instantes em `timestamptz`; a primeira versão usa `America/Sao_Paulo`.

## Implementado

- Páginas de entrada por marca, tema e terminologia, sem seleção de nicho pelo cliente.
- Autocadastro transacional: tenant, administrador, assinatura trial de 14 dias, serviço/profissional iniciais e sessão.
- Login/logout por marca; cookie HttpOnly, sessão expirada/revogável, validação de Origin e CSRF para escritas autenticadas.
- Cadastro e listagem de clientes, recursos/profissionais, disponibilidade semanal e serviços.
- Módulo Pet com cadastro de animais e relação própria entre pet e agendamento.
- Agenda diária/semanal, busca e filtro por profissional.
- Criação, remarcação, cancelamento e conclusão de atendimentos.
- Bloqueio/liberação de horários e prevenção de conflito na API, dentro de transação com trava do recurso.
- Dashboard com quantidade e valor previsto de serviços (não representa dinheiro recebido).
- Chaves estrangeiras compostas por tenant para impedir vínculos entre estabelecimentos, escopo de tenant nas consultas e auditoria de eventos de agenda.
- Testes de integração para isolamento, autorização, concorrência, estados e reutilização por outro vertical.

## Estrutura

```text
client/                 Interface única, adaptada pelo catálogo de marcas
server/
  core/                 Identidade, catálogo, contratos de extensão e agendamento
  modules/pet/          Validação e vínculo de pets ao agendamento
  db/                   Adaptadores PostgreSQL/PGlite e migração SQL
  app.ts                Composição das rotas e dos módulos
  index.ts              Inicialização e encerramento
  seed.ts               Dados demonstrativos explícitos
  dev.ts                API + Vite no desenvolvimento
tests/                  Testes de integração da API e do banco
docs/                   Decisões, escopo e próximos passos
```

O núcleo de agendamento recebe um registro de extensões por vertical e não importa o módulo Pet. A composição em `app.ts` liga os módulos ao kernel. Sites comerciais independentes e domínios próprios são próximos passos sobre essa mesma base.

## Verificação

```sh
npm run typecheck
npm test
npm run build
```

A suíte de interface é opcional e requer Chromium instalado: `npx playwright install chromium` e `npm run test:ui`. Ela percorre cadastro, tutor, pet, reserva, persistência, outra marca e layout móvel. Em ambientes sem download do navegador, mantenha a execução dos testes de API e build; a suíte de interface pode rodar no computador de desenvolvimento ou no CI.

Os testes usam um banco PGlite efêmero por padrão. Para executar as mesmas verificações contra PostgreSQL, use **um banco exclusivo de testes** e configure `TEST_DATABASE_URL`; os testes deixam os dados criados nesse banco. O script de testes cria contas distintas a cada execução.

## PostgreSQL e produção

`compose.yaml` fornece um PostgreSQL local opcional. Defina `POSTGRES_PASSWORD`, execute `docker compose up -d` e configure `DATABASE_URL` no `.env`.

```sh
npm run db:migrate
npm run build
npm start
```

Com build existente, o servidor entrega a interface em `http://localhost:3001/b/petflow`. Para uso direto nessa porta, ajuste `APP_ORIGIN=http://localhost:3001`. Para produção, configure HTTPS no proxy, `NODE_ENV=production`, banco externo e as origens/domínios permitidos.

**Este é um incremento de desenvolvimento, ainda não um serviço pronto para vender.** Antes de produção: validar contra PostgreSQL real na infraestrutura escolhida, testar recuperação de backup, configurar monitoramento, e-mail de verificação/recuperação de senha, regras comerciais, privacidade/retenção e limites distribuídos para várias instâncias.

## Próximas entregas

1. Edição/inativação de cadastros e gestão de usuários/permissões; configuração avançada de expediente.
2. Link público por estabelecimento, disponibilidade e confirmação de solicitação.
3. Site comercial de cada produto e onboarding orientado.
4. Cobrança real e política de trial/inadimplência; o trial atual é informativo, não bloqueia acesso nem cobra.
5. Notificações, WhatsApp, recorrência e gestão de recebimentos.
6. Painel do operador para marcas, tenants, planos e suporte.

Não há integração externa ou publicação em produção nesta entrega.

Leia [a definição funcional](Arquitetura_Kernel_SaaS_Agendamento.md) e [as decisões técnicas](docs/decisoes-tecnicas.md).
