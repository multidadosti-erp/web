# Plano de Implementacao - PWA Push no Windows (web_pwa_oca)

Objetivo: habilitar notificacoes nativas do Windows via PWA (Chrome/Edge) com controle de progresso por etapas.

## Status geral

- Estado atual: Em planejamento
- Modulo alvo: web_pwa_oca
- Ambiente alvo: Odoo 12
- Navegadores alvo: Edge/Chrome (desktop)

## Como vamos acompanhar

Use esta legenda em cada item:

- [ ] Nao iniciado
- [~] Em andamento
- [x] Concluido
- [!] Bloqueado

Em cada entrega, registrar:

1. Data
2. O que foi feito
3. Evidencia (arquivo/teste)
4. Status final (OK/pendente)

---

## Fase 1 - Fundacao de Push (backend)

### 1.1 Configuracoes e chaves VAPID
- [ ] Criar parametros de sistema para push (enable, public key, private key)
- [ ] Expor configuracoes em Settings (grupo admin)
- [ ] Definir regra de seguranca para proteger chave privada

Criterio de aceite:
- [ ] Admin consegue salvar/ler chave publica
- [ ] Chave privada nao fica exposta no frontend

### 1.2 Modelo de assinatura por dispositivo
- [ ] Criar modelo de subscriptions (usuario/dispositivo/browser)
- [ ] Campos minimos: user_id, endpoint, p256dh, auth, user_agent, ativo, last_seen
- [ ] Regra de unicidade por endpoint

Criterio de aceite:
- [ ] Reinscricao atualiza assinatura existente
- [ ] Dados invalidos sao rejeitados com erro claro

---

## Fase 2 - Inscricao no frontend (PWA)

### 2.1 Fluxo de permissao de notificacao
- [ ] Botao/acao "Ativar notificacoes" no painel PWA
- [ ] Solicitar Notification.requestPermission()
- [ ] Tratar estados: granted, denied, default

Criterio de aceite:
- [ ] UX informa status de permissao com mensagem clara

### 2.2 PushManager.subscribe + envio ao backend
- [ ] Obter service worker registration
- [ ] Chamar pushManager.subscribe com VAPID public key
- [ ] Enviar subscription para endpoint JSON autenticado

Criterio de aceite:
- [ ] Subscription salva no backend com user_id correto
- [ ] Repetir processo nao gera duplicidade

---

## Fase 3 - Service Worker de notificacoes

### 3.1 Evento push
- [ ] Implementar listener de push
- [ ] Normalizar payload (title/body/icon/badge/data.url)
- [ ] Chamar showNotification com defaults seguros

Criterio de aceite:
- [ ] Notificacao aparece no Windows com app instalado

### 3.2 Evento notificationclick
- [ ] Implementar listener de click
- [ ] Focar cliente existente ou abrir janela nova
- [ ] Redirecionar para URL do payload

Criterio de aceite:
- [ ] Clique abre/foca Odoo no destino esperado

---

## Fase 4 - Servico de envio no Odoo

### 4.1 Integracao de envio web push
- [ ] Adicionar dependencia de envio (ex.: pywebpush)
- [ ] Criar servico para enviar a 1 usuario e multiplos usuarios
- [ ] Tratar expiracao de endpoint (404/410) e desativar subscription

Criterio de aceite:
- [ ] Envio de teste com retorno de sucesso/falha por subscription

### 4.2 Acao de teste administravel
- [ ] Botao de teste em Settings para envio ao usuario atual
- [ ] Mensagem de retorno amigavel no backend

Criterio de aceite:
- [ ] Admin dispara teste e recebe notificacao no Windows

---

## Fase 5 - Seguranca, operacao e observabilidade

### 5.1 Seguranca
- [ ] Restringir operacoes de envio para grupos permitidos
- [ ] Sanitizar payload e limitar tamanho
- [ ] Validar origem e autenticacao dos endpoints de subscription

### 5.2 Operacao
- [ ] Log tecnico de disparos (sucesso/falha)
- [ ] Job de limpeza de subscriptions invalidas
- [ ] Indicador simples de saude (quantidade ativa por usuario)

Criterio de aceite:
- [ ] Sistema segue estavel apos falhas de endpoints

---

## Fase 6 - Testes e homologacao

### 6.1 Testes automatizados
- [ ] Teste de controller subscribe/unsubscribe
- [ ] Teste de servico de envio (mock)
- [ ] Teste de deduplicacao por endpoint

### 6.2 Testes manuais guiados
- [ ] Chrome/Edge Windows: permissao, inscricao, push, click
- [ ] Reinstalacao PWA e reinscricao
- [ ] Cenarios de negacao de permissao

Criterio de aceite:
- [ ] Roteiro manual completo assinado como OK

---

## Registro de entregas (OK por etapa)

| Data | Fase/Item | Responsavel | Evidencia | Resultado |
| --- | --- | --- | --- | --- |
| YYYY-MM-DD | Ex.: 1.1 Configuracoes VAPID | | arquivos/testes | OK/Pendente |

---

## Backlog tecnico (pos-MVP)

- [ ] Preferencias por tipo de notificacao por usuario
- [ ] Segmentacao por canal (vendas, financeiro, estoque)
- [ ] Retry inteligente com fila/cron
- [ ] Painel administrativo de subscriptions
- [ ] Templates de notificacao por evento de negocio

---

## Definicao de pronto (MVP)

MVP considerado pronto quando:

- [ ] Usuario ativa notificacoes no PWA
- [ ] Subscription fica persistida por usuario/dispositivo
- [ ] Backend envia push de teste com sucesso
- [ ] Windows exibe notificacao nativa
- [ ] Clique da notificacao abre/foca o Odoo na URL correta
- [ ] Fluxo validado manualmente em Edge e Chrome
