'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface SessionInfo {
  tabId: string;
  timestamp: number;
  isActive: boolean;
  userAgent?: string;
  lastHeartbeat: number;
}

interface UseSessionControlReturn {
  isSessionActive: boolean;
  isMultipleSession: boolean;
  showSessionModal: boolean;
  activeSessionInfo: SessionInfo | null;
  takeControl: () => void;
  stayInactive: () => void;
  sessionStatus: 'active' | 'inactive' | 'checking' | 'taking_control';
  wasControlTaken: boolean; // Nova propriedade para indicar se perdeu controle
}

const SESSION_KEY = 'bmgbr3_session';
const HEARTBEAT_INTERVAL = 5000; // 5 segundos
const SESSION_TIMEOUT = 15000; // 15 segundos para considerar sessão morta

export const useSessionControl = (): UseSessionControlReturn => {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isMultipleSession, setIsMultipleSession] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [activeSessionInfo, setActiveSessionInfo] = useState<SessionInfo | null>(null);
  const [sessionStatus, setSessionStatus] = useState<'active' | 'inactive' | 'checking' | 'taking_control'>('checking');
  const [wasControlTaken, setWasControlTaken] = useState(false);
  
  const currentTabId = useRef<string>('');
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);
  const sessionCheckInterval = useRef<NodeJS.Timeout | null>(null);

  // Gerar ID único para esta aba
  useEffect(() => {
    currentTabId.current = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Função para verificar sessões existentes
  const checkExistingSessions = useCallback(() => {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (!stored) {
        // Não há sessão ativa - pode ativar
        return null;
      }

      const sessionData: SessionInfo = JSON.parse(stored);
      const now = Date.now();
      
      // Verificar se a sessão ainda está viva (heartbeat recente)
      if (now - sessionData.lastHeartbeat > SESSION_TIMEOUT) {
        // Sessão morta - limpar e permitir nova
        localStorage.removeItem(SESSION_KEY);
        return null;
      }

      // Verificar se é a mesma aba (caso de reload)
      if (sessionData.tabId === currentTabId.current) {
        return null; // É a mesma aba
      }

      return sessionData;
    } catch (error) {
      console.warn('Erro ao verificar sessões existentes:', error);
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }, []);

  // Função para ativar sessão atual
  const activateCurrentSession = useCallback(() => {
    const sessionData: SessionInfo = {
      tabId: currentTabId.current,
      timestamp: Date.now(),
      isActive: true,
      userAgent: navigator.userAgent,
      lastHeartbeat: Date.now()
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    setIsSessionActive(true);
    setIsMultipleSession(false);
    setShowSessionModal(false);
    setSessionStatus('active');
  }, []);

  // Função para desativar sessão atual
  const deactivateCurrentSession = useCallback(() => {
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
      heartbeatInterval.current = null;
    }
    
    setIsSessionActive(false);
    setSessionStatus('inactive');
  }, []);

  // Função de heartbeat para manter sessão viva
  const sendHeartbeat = useCallback(() => {
    if (!isSessionActive) return;

    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        const sessionData: SessionInfo = JSON.parse(stored);
        if (sessionData.tabId === currentTabId.current) {
          sessionData.lastHeartbeat = Date.now();
          localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
        }
      }
    } catch (error) {
      console.warn('Erro no heartbeat:', error);
    }
  }, [isSessionActive]);

  // Função para assumir controle
  const takeControl = useCallback(() => {
    setSessionStatus('taking_control');
    
    // Primeiro remover a sessão antiga para disparar evento nas outras abas
    localStorage.removeItem(SESSION_KEY);
    
    // Aguardar um pouco para garantir que outras abas detectem a remoção
    setTimeout(() => {
          // Então ativar a nova sessão
    activateCurrentSession();
    setWasControlTaken(false); // Resetar flag ao assumir controle
    console.log('✅ Controle assumido com sucesso');
    }, 200);
  }, [activateCurrentSession]);

  // Função para manter inativo (simplificada - modal não fecha mais automaticamente)
  const stayInactive = useCallback(() => {
    // Não faz nada - modal permanece aberto até assumir controle
  }, []);

  // Verificação inicial e setup
  useEffect(() => {
    const existingSession = checkExistingSessions();
    
    if (existingSession) {
      // Há sessão ativa - mostrar modal
      setActiveSessionInfo(existingSession);
      setIsMultipleSession(true);
      setShowSessionModal(true);
      setSessionStatus('inactive');
      setWasControlTaken(false); // É detecção inicial, não perda de controle
    } else {
      // Não há sessão - ativar imediatamente
      activateCurrentSession();
    }
  }, [checkExistingSessions, activateCurrentSession]);

  // Setup do heartbeat quando sessão ativa
  useEffect(() => {
    if (isSessionActive && !heartbeatInterval.current) {
      // Enviar heartbeat imediatamente
      sendHeartbeat();
      
      // Setup interval
      heartbeatInterval.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    }

    return () => {
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
        heartbeatInterval.current = null;
      }
    };
  }, [isSessionActive, sendHeartbeat]);

  // Monitorar mudanças no localStorage (outras abas)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SESSION_KEY) {
        if (!e.newValue) {
          // Sessão foi removida - aguardar um pouco para ver se outra aba assume
          setTimeout(() => {
            const currentSession = localStorage.getItem(SESSION_KEY);
            if (!currentSession && !isSessionActive && isMultipleSession) {
              // Ninguém assumiu - pode ativar
              console.log('🔄 Sessão principal fechou - assumindo controle automaticamente');
              setIsMultipleSession(false);
              setShowSessionModal(false);
              setWasControlTaken(false);
              activateCurrentSession();
            }
          }, 500); // Aguardar 500ms para outras abas reagirem
        } else {
          // Sessão foi atualizada - verificar se foi "roubada"
          try {
            const newSessionData: SessionInfo = JSON.parse(e.newValue);
            
            // Se estava ativo mas o tabId mudou, perdeu controle
            if (isSessionActive && newSessionData.tabId !== currentTabId.current) {
              console.log('🔄 Sessão assumida por outra aba - mostrando modal de retomada');
              setActiveSessionInfo(newSessionData);
              setIsSessionActive(false);
              setIsMultipleSession(true);
              setShowSessionModal(true);
              setSessionStatus('inactive');
              setWasControlTaken(true); // Marcar que perdeu controle
              
              // Parar heartbeat imediatamente
              if (heartbeatInterval.current) {
                clearInterval(heartbeatInterval.current);
                heartbeatInterval.current = null;
              }
            }
          } catch (error) {
            console.warn('Erro ao processar mudança de sessão:', error);
          }
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [isSessionActive, isMultipleSession, activateCurrentSession]);

  // Limpeza na saída da página
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isSessionActive) {
        localStorage.removeItem(SESSION_KEY);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (isSessionActive) {
        localStorage.removeItem(SESSION_KEY);
      }
    };
  }, [isSessionActive]);

  // Verificação periódica de sessões mortas
  useEffect(() => {
    sessionCheckInterval.current = setInterval(() => {
      if (!isSessionActive && isMultipleSession) {
        const existingSession = checkExistingSessions();
        if (!existingSession) {
          // Sessão morta - pode ativar
          setIsMultipleSession(false);
          setShowSessionModal(false);
          activateCurrentSession();
        }
      }
    }, HEARTBEAT_INTERVAL);

    return () => {
      if (sessionCheckInterval.current) {
        clearInterval(sessionCheckInterval.current);
      }
    };
  }, [isSessionActive, isMultipleSession, checkExistingSessions, activateCurrentSession]);

  return {
    isSessionActive,
    isMultipleSession,
    showSessionModal,
    activeSessionInfo,
    takeControl,
    stayInactive,
    sessionStatus,
    wasControlTaken
  };
}; 