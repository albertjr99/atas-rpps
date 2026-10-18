# Plano de etapas

## Etapa 0 — Base limpa ✅

- Backend do AGL (multi-RPPS) + frontend do ATA em um único repositório.
- Segurança: segredos só via ambiente, isolamento por RPPS testado, sem dependências da Emergent, sem rastreamento.
- Ata-modelo DOCX usada como base da exportação.
- Testes automatizados do fluxo completo (com IA simulada).

## Etapa 1 — Gravação robusta ✅

- Gravação contínua em trechos independentes de 45 s (um `MediaRecorder` novo por trecho sobre o mesmo
  microfone; com `timeslice` só o primeiro pedaço teria cabeçalho e a transcrição rejeitaria os demais).
- Cada trecho é salvo no aparelho (IndexedDB) antes do envio e só é apagado após a confirmação do servidor.
  Fila em ordem, com nova tentativa automática (rede caída, falha do provedor) e retomada ao reabrir a página.
- Id por trecho: reenviar o mesmo trecho não transcreve nem duplica o texto (`transcript_segments`).
- Trechos praticamente mudos não são enviados; frases típicas de "alucinação" no silêncio são removidas no servidor.
- Vocabulário do setor e final do trecho anterior enviados como contexto à transcrição.
- Botão "Encerrar item e ir para o próximo" sem parar a gravação; o resumo do item espera os trechos dele chegarem.
- Tela acesa durante a gravação (Wake Lock), aviso antes de fechar a aba, mensagens claras de microfone/HTTPS.
- Upload de gravação pronta (Zoom/Meet/Teams, gravador): ffmpeg divide em partes de 10 min, transcrição em
  segundo plano com progresso e, para a reunião inteira, a IA indica onde começa cada item (só índices; o texto
  não é reescrito). O arquivo é apagado do servidor após o processamento.
- PWA instalável (manifest, ícones, service worker que nunca guarda respostas da API) e layout para celular.

Pendente para depois: transcrição em tempo real (streaming) e gravação com a tela do celular bloqueada no iOS
(o Safari pausa o microfone em segundo plano; no Android/Chrome funciona com a tela acesa).

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
