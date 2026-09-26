# Decisões técnicas — incremento 0.1

Data: 25/09/2026. Escopo: primeira base executável, sem implantação pública.

## 1. Monólito modular em TypeScript

React/Vite no frontend e Fastify no backend permitem uma linguagem compartilhada, execução simples e fronteiras de módulo explícitas. A escolha foi feita para desenvolver e testar o produto em pequenos incrementos. Não precisamos de microserviços nem de uma aplicação independente para cada nicho.

O shell visual é compartilhado e recebe um catálogo confiável do servidor. O cliente não escolhe vertical em um formulário. O prefixo `/b/petflow`, por exemplo, representa um produto de origem. Domínios reais podem ser associados pelo operador via `BRAND_HOSTS`; a API valida se a marca da rota corresponde ao domínio. O servidor redireciona a raiz de um domínio configurado para a rota daquela marca.

As páginas atuais são páginas de entrada/cadastro do produto. Landing pages com conteúdo de venda, SEO e campanhas ainda não foram criadas. Não se presume disponibilidade dos nomes ou domínios.

## 2. PostgreSQL, inclusive no desenvolvimento

O adaptador `server/db/index.ts` oferece `query` e `transaction`. Em desenvolvimento sem `DATABASE_URL`, PGlite executa PostgreSQL de forma embarcada e persistente. Com a variável configurada, usamos `pg.Pool`. O DDL e as regras SQL são os mesmos; PGlite não é a configuração de produção e suas características de concorrência não substituem testes em PostgreSQL externo.

A migração 001 é versionada em `schema_migrations` e aplicada sob trava de tabela. Migrações futuras devem ser novos arquivos e novas versões; nunca alterar 001 após a implantação em banco compartilhado. O executor inicial aceita DDL simples; funções SQL com ponto e vírgula interno exigirão evolução do executor.

Referências oficiais: [PGlite API](https://pglite.dev/docs/api), [PostgreSQL: explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html).

## 3. Tenancy e identidade

- `core_brand` referencia `core_vertical`; `core_tenant` referencia a marca.
- Uma conta de usuário pertence a um tenant nesta versão. Membership em várias empresas fica para uma etapa posterior.
- A unicidade de e-mail por marca é garantida pela transação de cadastro com trava da marca; a constraint de usuário também impede duplicata dentro do tenant.
- O contexto de tenant vem exclusivamente da sessão consultada no banco. APIs não recebem tenant do navegador como autorização.
- Chaves estrangeiras compostas incluem `tenant_id` nos vínculos de clientes, recursos, serviços, reservas, usuários e pets.
- Todas as consultas operacionais incluem escopo de tenant. Ainda não há Row Level Security: a proteção atual combina aplicação e constraints. RLS é uma defesa adicional a avaliar antes de acesso direto ao banco por outros serviços.
- Cookies HttpOnly/SameSite, Secure em produção; token de sessão aleatório de 256 bits, somente hash no banco. CSRF é vinculado à sessão e exigido nas escritas autenticadas. Login/cadastro também validam Origin.
- Rate limit local por IP, sem confiar automaticamente em cabeçalhos de proxy. Ao implantar atrás de proxy, definir cuidadosamente IP de origem e limites distribuídos. Não basta habilitar `trustProxy` irrestritamente.
- E-mail de verificação, recuperação de senha, MFA, convite/equipe, revogação de todas as sessões e políticas de retenção ainda não estão implementados.

## 4. Regra de agendamento

Uma reserva contém um cliente, serviço e recurso principal. Preço e duração são congelados no ato da criação. `starts_at` e `ends_at` guardam instantes absolutos; o expediente é avaliado no fuso do tenant, inicialmente fixo em São Paulo.

Na transação, a API obtém `SELECT ... FOR UPDATE` no recurso **antes** de consultar sobreposições e inserir. PostgreSQL usa READ COMMITTED para que uma segunda transação enxergue o commit da primeira depois de esperar pela trava. Bloqueios pontuais usam a mesma trava. Horários adjacentes são permitidos: `início < fim existente` e `fim > início existente` caracterizam a colisão. Cancelamento libera o horário; conclusão mantém o histórico ocupado.

A remarcação mantém recurso, serviço, tutor e duração; só muda o intervalo. Trocas de recurso/serviço são um incremento futuro. Conclusão antes do início é recusada. A API impede novas reservas no passado. Não há atendimento com múltiplos serviços/etapas/recursos, encaixe por capacidade, recorrência ou lista de espera.

Essas garantias dependem de todas as escritas de agenda passarem pelo serviço. Acesso SQL administrativo pode ignorar as regras de disponibilidade; restringir credenciais de produção. Uma constraint de exclusão por intervalo pode adicionar proteção independente em uma futura migração.

## 5. Extensões verticais

`server/core/booking.ts` recebe um registro de extensões com os contratos `validate` e `save`. Não importa Pet. A composição em `server/app.ts` registra `petBookingExtension`.

Pet valida que o animal é do tutor e do tenant. A relação fica em `pet_booking`, sem `pet_id` na reserva central. Barbearia reutiliza o mesmo serviço de agendamento sem extensão. Salão e Estética usam esse mesmo fluxo básico; prontuário ou dados clínicos não foram introduzidos.

O DDL está em um arquivo inicial por simplicidade operacional, com nomes `core_*` e `pet_*`. A leitura agregada do painel e as rotas de Pet ainda estão na composição da API; a extração para plugins de rota pode ocorrer quando o módulo crescer. Não há um framework de plugins instaláveis ou entidade dinâmica.

## 6. Limites conhecidos e próximos passos

| Área           | Entregue                                                            | Próximo incremento                                             |
| -------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| Marca/vertical | Catálogo e resolução controlados pelo servidor                      | Painel do operador, domínio e site comercial de cada oferta    |
| Tenant/usuário | Autocadastro, login/logout, isolamento                              | Convites, recuperação de acesso, edição de dados e suspensão   |
| Cadastros      | Criação/listagem de cliente, recurso e serviço                      | Edição, inativação e paginação                                 |
| Agenda         | Dia/semana, reserva, remarcação, cancelamento, conclusão e bloqueio | Agendamento público, aceite, recorrência e múltiplas etapas    |
| Pet            | Cadastro e vínculo com tutor/reserva                                | Edição, fotos e histórico dedicado                             |
| Assinatura     | Trial informativo persistido                                        | Provedor de cobrança, webhook idempotente e regras de acesso   |
| Financeiro     | Preço do serviço e valor previsto                                   | Recebimentos, pagamentos e conciliação                         |
| Avisos         | Feedback na interface                                               | Fila, reenvio, e-mail e WhatsApp                               |
| Auditoria      | Eventos de cadastro do tenant e agenda                              | Valores anteriores/novos e tela de consulta                    |
| Operação       | Build, migrações, testes e configuração                             | CI, backup/restore, monitoramento, hospedagem e teste de carga |

A leitura inicial do painel traz todos os registros do tenant; paginar antes de contas com volume alto. A sessão dura sete dias; limpeza periódica das expiradas é tarefa de operação futura. As telas exibem corretamente a ausência de cobrança e não simulam integrações externas.
