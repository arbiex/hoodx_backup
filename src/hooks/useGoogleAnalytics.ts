'use client'

declare global {
  interface Window {
    gtag: (
      command: 'config' | 'event' | 'js' | 'set',
      targetId: string | Date,
      config?: {
        page_title?: string;
        page_location?: string;
        custom_map?: { [key: string]: string };
        [key: string]: any;
      }
    ) => void;
    dataLayer: any[];
  }
}

export const useGoogleAnalytics = () => {
  // Rastrear eventos personalizados
  const trackEvent = (
    eventName: string,
    eventParameters: {
      event_category?: string;
      event_label?: string;
      value?: number;
      [key: string]: any;
    } = {}
  ) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', eventName, eventParameters);
    }
  };

  // Rastrear mudanças de página
  const trackPageView = (url: string, title?: string) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('config', 'G-0VT8809YH3', {
        page_location: url,
        page_title: title,
      });
    }
  };

  // Rastrear conversões
  const trackConversion = (conversionId: string, value?: number, currency: string = 'BRL') => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'conversion', {
        send_to: conversionId,
        value: value,
        currency: currency,
      });
    }
  };

  // Rastrear compras/transações
  const trackPurchase = (transactionId: string, value: number, currency: string = 'BRL', items?: any[]) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'purchase', {
        transaction_id: transactionId,
        value: value,
        currency: currency,
        items: items,
      });
    }
  };

  // Rastrear login
  const trackLogin = (method: string = 'email') => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'login', {
        method: method,
      });
    }
  };

  // Rastrear cadastro
  const trackSignUp = (method: string = 'email') => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'sign_up', {
        method: method,
      });
    }
  };

  return {
    trackEvent,
    trackPageView,
    trackConversion,
    trackPurchase,
    trackLogin,
    trackSignUp,
  };
}; 