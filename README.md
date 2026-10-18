# Atas RPPS

Sistema de atas para comitês de investimentos e conselhos de RPPS: grava a reunião pelo navegador (inclusive no
celular), transcreve, resume cada item da pauta, registra as deliberações e gera a ata no padrão do próprio RPPS.

Este repositório consolida dois projetos anteriores:

- **AGL Atas** (`ATAS-COMIN`): núcleo multi-RPPS, leitura da ata-modelo, foco em comitês de investimentos.
- **ATA** (fork de `lucasjnr/ATA`): visual, condução da reunião com gravação e transcrição, painel de deliberações.

Veja [docs/ORIGEM.md](docs/ORIGEM.md) para o que veio de cada um e [docs/PLANO.md](docs/PLANO.md) para as próximas etapas.

## Estrutura

```
backend/   FastAPI (Python 3.11+), SQLite, IA direta (OpenAI/Anthropic)
  app/core/       configuração, banco, segurança, cliente de IA
  app/api/        rotas /api (auth, reuniões, deliberações, base de conhecimento, admin)
  app/services/   IA da reunião, perfil da ata-modelo, exportação, agente revisor, dados do BCB
  tests/          testes automatizados (pytest)
frontend/  React 19 + Tailwind + shadcn/ui (visual do ATA)
docs/      plano de etapas e histórico da consolidação
```

## Rodando localmente

Backend:

```bash
cd backend
cp .env.example .env          # preencha OPENAI_API_KEY para transcrever e gerar atas
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

Frontend (em outro terminal; o `proxy` do package.json aponta para a porta 8000):

```bash
cd frontend
yarn install
yarn start                     # http://localhost:3000
```

Com `ALLOW_SIGNUP=true` (padrão em desenvolvimento), use "Cadastrar meu RPPS" na tela de login para criar o primeiro
RPPS e seu administrador. Depois, em **Base de Conhecimento**, envie a ata-modelo do RPPS em DOCX.

Testes:

```bash
cd backend && python -m pytest -q
```

## Perfis de acesso

| Perfil | O que pode fazer |
|---|---|
| `superadmin` | Administrador da plataforma (criado só via `ADMIN_EMAIL`/`ADMIN_PASSWORD`); cadastra RPPS em `/api/admin/tenants` |
| `admin` | Administra o próprio RPPS: usuários, configurações, ata-modelo |
| `editor` | Secretário(a): cria e conduz reuniões, gera e edita atas |
| `viewer` | Somente leitura |

Todos os dados são isolados por RPPS: um usuário nunca enxerga reuniões, deliberações ou documentos de outro RPPS.

## Deploy

O `Dockerfile` gera uma única imagem (build do React servido pelo FastAPI). O `render.yaml` configura o Render com
disco persistente em `/data`. Em produção, `SECRET_KEY` é obrigatória e o cadastro público fica desligado.

## Segurança (Etapa 0)

- Nenhuma senha, chave ou conta fixa no código; tudo vem de variáveis de ambiente.
- Removidos: conta `agl@agl.com`/`AGL2026`, chave secreta padrão do AGL, script externo da Emergent e o
  rastreamento PostHog com gravação de sessão que vinha no `index.html` do ATA.
- Falhas de IA retornam erro (HTTP 502) e nunca são gravadas dentro da ata.
- Proteção contra path traversal ao servir o frontend e limite de tentativas de login.
