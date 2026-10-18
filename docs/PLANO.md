# Plano de etapas

## Etapa 0 — Base limpa ✅

- Backend do AGL (multi-RPPS) + frontend do ATA em um único repositório.
- Segurança: segredos só via ambiente, isolamento por RPPS testado, sem dependências da Emergent, sem rastreamento.
- Ata-modelo DOCX usada como base da exportação.
- Testes automatizados do fluxo completo (com IA simulada).

## Etapa 1 — Gravação robusta

- Gravar em pedaços de 30 a 60 s (`MediaRecorder.start(timeslice)`) e enviar cada pedaço ao
  `/topics/{id}/transcribe`, que já acrescenta a transcrição (backend pronto).
- Cópia local dos pedaços no navegador (IndexedDB) até a confirmação do servidor.
- Wake Lock API para manter a tela do celular acesa.
- Service worker (PWA instalável).
- Gravação contínua com botão "próximo item da pauta" marcando o tempo da troca.
- Upload de gravação pronta (Zoom/Meet/Teams), dividida no servidor em trechos.

## Etapa 2 — Fidelidade total ao modelo DOCX

- "Modelo anotado": marcadores dentro do DOCX indicando onde entra cada seção, confirmados uma vez pelo RPPS.
- Geração por seção, preenchendo só o conteúdo entre os marcadores.
- Prévia em PDF lado a lado com a ata anterior.

## Etapa 3 — Quem falou e votações

- Transcrição com identificação de locutor (diarização).
- Chamada no início da reunião para associar vozes aos membros; correção com um clique.
- Detecção de votações e confirmação do resultado pelo secretário.

## Etapa 4 — Dados externos e pendências

- Leitura do relatório mensal da consultoria (PDF): rentabilidade, carteira, enquadramento.
- Fonte e data em cada dado inserido automaticamente.
- Campos `[PREENCHER: ...]` destacados no editor; ata não finaliza com pendências.

## Etapa 5 — Deliberações e pendências

- Pendências abertas entram automaticamente na pauta da próxima reunião.
- Lembretes antes do prazo.

## Etapa 6 — Aprovação, assinatura e publicação

- Fluxo rascunho → revisão → comentários dos membros → aprovação, com histórico de versões.
- Assinatura eletrônica via plataforma com API (ex.: ZapSign, Clicksign, D4Sign) com ICP-Brasil.
- PDF/A final com hash; link público ou pacote para o portal da transparência.

## Transversal

- LGPD: consentimento de gravação registrado na ata; áudio apagado após aprovação (prazo configurável);
  contratos com provedores de IA sem uso dos dados para treino.
- Conjunto de teste com ~10 reuniões reais (áudio + ata oficial) para medir a qualidade a cada mudança.
- Migração de SQLite para Postgres quando houver mais de um servidor ou muitos RPPS.
