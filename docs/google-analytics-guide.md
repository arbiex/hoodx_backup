# Google Analytics - Guia de Implementação

## 📊 Visão Geral

O Google Analytics foi implementado no projeto usando as melhores práticas do Next.js 13+ com App Router. A implementação inclui:

- ✅ Rastreamento automático de página
- ✅ Eventos personalizados 
- ✅ Rastreamento de login/cadastro
- ✅ Rastreamento de indicações/referrals
- ✅ Hook personalizado para uso em componentes

## 🔧 Configuração

### ID do Google Analytics
- **ID**: `G-0VT8809YH3`
- **Estratégia**: `afterInteractive` (otimizado para performance)

### Arquivos Implementados

1. **`/src/components/GoogleAnalytics.tsx`** - Componente principal
2. **`/src/hooks/useGoogleAnalytics.ts`** - Hook personalizado
3. **`/src/app/layout.tsx`** - Integração no layout principal

## 📈 Eventos Rastreados Automaticamente

### Autenticação
- `login` - Quando usuário faz login
- `sign_up` - Quando usuário se cadastra
- `user_engagement` - Engajamento geral

### Marketing/Indicações
- `referral_conversion` - Quando alguém se cadastra via indicação

## 🛠️ Como Usar o Hook

```tsx
import { useGoogleAnalytics } from '@/hooks/useGoogleAnalytics'

function MeuComponente() {
  const { trackEvent, trackPurchase, trackLogin } = useGoogleAnalytics()
  
  const handleClick = () => {
    trackEvent('button_click', {
      event_category: 'engagement',
      event_label: 'cta_button',
      value: 1
    })
  }
  
  const handlePurchase = () => {
    trackPurchase('trans_123', 29.90, 'BRL', [
      { item_id: 'credits_100', item_name: 'Créditos', quantity: 1 }
    ])
  }
  
  return (
    <button onClick={handleClick}>
      Rastrear Evento
    </button>
  )
}
```

## 📊 Funções Disponíveis

### `trackEvent(eventName, parameters)`
Rastreia eventos personalizados.

### `trackPageView(url, title)`
Rastreia visualizações de página.

### `trackPurchase(transactionId, value, currency, items)`
Rastreia compras/transações.

### `trackLogin(method)`
Rastreia logins de usuário.

### `trackSignUp(method)`
Rastreia cadastros de usuário.

### `trackConversion(conversionId, value, currency)`
Rastreia conversões específicas.

## 🎯 Eventos Customizados Sugeridos

```tsx
// Compra de créditos
trackPurchase('trans_123', 29.90, 'BRL')

// Início de estratégia de bot
trackEvent('strategy_start', {
  event_category: 'bot_usage',
  event_label: 'blaze_mega_roulette',
  strategy_type: 'BMG'
})

// Saque realizado
trackEvent('withdrawal_request', {
  event_category: 'financial',
  event_label: 'pix_withdrawal',
  value: 100.00
})

// Indicação bem-sucedida
trackEvent('referral_success', {
  event_category: 'marketing',
  event_label: 'new_referral'
})
```

## 🔍 Monitoramento

Para ver os dados no Google Analytics:

1. Acesse [Google Analytics](https://analytics.google.com)
2. Selecione a propriedade `G-0VT8809YH3`
3. Navegue para **Relatórios** > **Eventos**
4. Visualize eventos em tempo real em **Tempo real** > **Eventos**

## 🚀 Próximos Passos Sugeridos

1. **Enhanced E-commerce**: Implementar rastreamento detalhado de compras
2. **Conversions**: Configurar metas de conversão no GA4
3. **Custom Dimensions**: Adicionar dimensões personalizadas para estratégias de bot
4. **User ID**: Implementar User ID para rastreamento cross-device
5. **Privacy**: Implementar consentimento de cookies (LGPD/GDPR)

## 📝 Exemplo Prático

```tsx
'use client'

import { useGoogleAnalytics } from '@/hooks/useGoogleAnalytics'
import { useEffect } from 'react'

export default function DashboardPage() {
  const { trackPageView, trackEvent } = useGoogleAnalytics()
  
  useEffect(() => {
    // Rastrear acesso ao dashboard
    trackPageView(window.location.href, 'Dashboard')
    
    trackEvent('page_view', {
      event_category: 'navigation',
      event_label: 'dashboard_access'
    })
  }, [])
  
  return (
    <div>
      {/* Conteúdo do dashboard */}
    </div>
  )
}
``` 