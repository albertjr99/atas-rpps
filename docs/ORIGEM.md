# Origem do código

Consolidação feita em outubro de 2026 a partir de:

- `albertjr99/ATAS-COMIN` (AGL Atas), commit `55e4a78`
- `albertjr99/ATA` (fork de `lucasjnr/ATA`), commit `60e84ac`

## O que veio de cada projeto

| Parte | Origem | Mudanças |
|---|---|---|
| Frontend (todas as telas, visual, gravação no navegador) | ATA | Removidos script da Emergent e PostHog; perfis admin/editor/viewer; selo e ação de "ata-modelo" na base de conhecimento; link de cadastro só aparece se habilitado; ícone inexistente (`TextBolder`) corrigido, o que impedia o build |
| Contrato da API (`/api/meetings`, `/topics/.../transcribe`, `/finalize`, `/generate-ata`, deliberações, agente) | ATA | Reescrito sobre SQLite com isolamento por RPPS; MongoDB removido |
| Conceito multi-RPPS (tenants), hash de senha PBKDF2, provedores OpenAI/Anthropic | AGL | Segredos só via ambiente; erros de IA viram exceção em vez de texto |
| Leitura da ata-modelo (padrão visual e linguístico) | AGL (ideia do `knowledge_extractor`) | Nova implementação enxuta em `services/model_profile.py` |
| Exportação DOCX | Nova | Usa o próprio DOCX-modelo do RPPS como base (cabeçalho, rodapé, brasão e margens preservados) |
| Prompts de resumo de item e geração de ata | ATA | Agora recebem o perfil da ata-modelo e proíbem inventar fatos; dados ausentes viram `[PREENCHER: ...]` |
| Agente revisor com aceite/rejeição | ATA (versão reduzida do agente do AGL) | Sem Emergent; sugestões respondidas não podem ser respondidas de novo |
| Indicadores do Banco Central | ATA | Sem valores inventados quando a fonte falha; IPCA 12 meses (série 13522) em vez da variação mensal; CDI anualizado; aviso de que não é recomendação |
| Modelos de pauta | ATA | Acrescentados modelos de comitê de investimentos e conselhos de RPPS |

## O que ficou de fora (por enquanto)

Do AGL: editor por seções com "blueprint", copiloto, motor de workflow, nota por seção via IA e telas Jinja. A
lógica pode ser portada nas próximas etapas, já no visual do ATA.
