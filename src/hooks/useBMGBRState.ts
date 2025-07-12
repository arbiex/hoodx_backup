import { useReducer, useEffect, useRef } from 'react';

// Definir tipos para o estado
interface BMGBRState {
  // Estados de operação
  isOperating: boolean;
  operationActive: boolean;
  operationLoading: boolean;
  operationError: string | null;
  operationSuccess: string | null;
  
  // Estados de conexão
  connectionStatus: {
    connected: boolean;
    error?: string;
    lastUpdate: number;
  };
  
  // Estados de autenticação
  authTokens: {
    ppToken: string;
    jsessionId: string;
    pragmaticUserId?: string;
  } | null;
  
  // Estados de configuração
  selectedStake: number;
  martingaleSequence: number[];
  totalMartingaleAmount: number;
  
  // Estados de dados
  websocketLogs: Array<{ 
    timestamp: number; 
    message: string; 
    type: 'info' | 'error' | 'success' | 'game' | 'bets-open' | 'bets-closed' 
  }>;
  lastTenResults: Array<{ 
    number: number; 
    color: string;
    gameId: string; 
    timestamp: number 
  }>;
  
  // Estados de configuração avançada
  autoBotEnabled: boolean;
  autoBotThreshold: number;
  m4DirectBetType: 'red' | 'black' | 'even' | 'odd' | 'low' | 'high';
  
  // Estados de UI
  forceOperatingDisplay: boolean;
  canSafelyStop: boolean;
}

// Definir actions
type BMGBRAction =
  | { type: 'SET_OPERATING'; payload: boolean }
  | { type: 'SET_OPERATION_LOADING'; payload: boolean }
  | { type: 'SET_OPERATION_ERROR'; payload: string | null }
  | { type: 'SET_OPERATION_SUCCESS'; payload: string | null }
  | { type: 'SET_CONNECTION_STATUS'; payload: BMGBRState['connectionStatus'] }
  | { type: 'SET_AUTH_TOKENS'; payload: BMGBRState['authTokens'] }
  | { type: 'SET_SELECTED_STAKE'; payload: number }
  | { type: 'SET_MARTINGALE_SEQUENCE'; payload: number[] }
  | { type: 'SET_WEBSOCKET_LOGS'; payload: BMGBRState['websocketLogs'] }
  | { type: 'SET_LAST_TEN_RESULTS'; payload: BMGBRState['lastTenResults'] }
  | { type: 'SET_AUTO_BOT_ENABLED'; payload: boolean }
  | { type: 'SET_M4_DIRECT_BET_TYPE'; payload: BMGBRState['m4DirectBetType'] }
  | { type: 'SET_FORCE_OPERATING_DISPLAY'; payload: boolean }
  | { type: 'SET_CAN_SAFELY_STOP'; payload: boolean }
  | { type: 'RESET_ALL' };

// Estado inicial
const initialState: BMGBRState = {
  isOperating: false,
  operationActive: false,
  operationLoading: false,
  operationError: null,
  operationSuccess: null,
  
  connectionStatus: { connected: false, lastUpdate: Date.now() },
  authTokens: null,
  
  selectedStake: 0.50,
  martingaleSequence: [],
  totalMartingaleAmount: 0,
  
  websocketLogs: [],
  lastTenResults: [],
  
  autoBotEnabled: false,
  autoBotThreshold: 50,
  m4DirectBetType: 'red',
  
  forceOperatingDisplay: false,
  canSafelyStop: true,
};

// Reducer
function bmgbrReducer(state: BMGBRState, action: BMGBRAction): BMGBRState {
  switch (action.type) {
    case 'SET_OPERATING':
      return { ...state, isOperating: action.payload };
    case 'SET_OPERATION_LOADING':
      return { ...state, operationLoading: action.payload };
    case 'SET_OPERATION_ERROR':
      return { ...state, operationError: action.payload };
    case 'SET_OPERATION_SUCCESS':
      return { ...state, operationSuccess: action.payload };
    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: action.payload };
    case 'SET_AUTH_TOKENS':
      return { ...state, authTokens: action.payload };
    case 'SET_SELECTED_STAKE':
      return { 
        ...state, 
        selectedStake: action.payload,
        martingaleSequence: calculateMartingaleSequence(action.payload),
        totalMartingaleAmount: calculateTotalAmount(calculateMartingaleSequence(action.payload))
      };
    case 'SET_MARTINGALE_SEQUENCE':
      return { 
        ...state, 
        martingaleSequence: action.payload,
        totalMartingaleAmount: calculateTotalAmount(action.payload)
      };
    case 'SET_WEBSOCKET_LOGS':
      return { ...state, websocketLogs: action.payload };
    case 'SET_LAST_TEN_RESULTS':
      return { ...state, lastTenResults: action.payload };
    case 'SET_AUTO_BOT_ENABLED':
      return { ...state, autoBotEnabled: action.payload };
    case 'SET_M4_DIRECT_BET_TYPE':
      return { ...state, m4DirectBetType: action.payload };
    case 'SET_FORCE_OPERATING_DISPLAY':
      return { ...state, forceOperatingDisplay: action.payload };
    case 'SET_CAN_SAFELY_STOP':
      return { ...state, canSafelyStop: action.payload };
    case 'RESET_ALL':
      return initialState;
    default:
      return state;
  }
}

// Funções auxiliares
function calculateMartingaleSequence(stake: number): number[] {
  if (stake <= 0) return [];
  
  const sequence: number[] = [];
  sequence.push(stake);      // M1 = 1x stake
  sequence.push(stake * 4);  // M2 = 4x stake
  sequence.push(stake * 10); // M3 = 10x stake
  sequence.push(stake * 22); // M4 = 22x stake
  
  return sequence;
}

function calculateTotalAmount(sequence: number[]): number {
  return sequence.reduce((total, value) => total + value, 0);
}

// Hook principal
export function useBMGBRState() {
  const [state, dispatch] = useReducer(bmgbrReducer, initialState);
  
  // Inicializar sequência
  useEffect(() => {
    if (state.martingaleSequence.length === 0) {
      const initialSequence = calculateMartingaleSequence(state.selectedStake);
      dispatch({ type: 'SET_MARTINGALE_SEQUENCE', payload: initialSequence });
    }
  }, [state.selectedStake, state.martingaleSequence.length]);
  
  // Funções de conveniência
  const setOperating = (isOperating: boolean) => {
    dispatch({ type: 'SET_OPERATING', payload: isOperating });
  };
  
  const setOperationError = (error: string | null) => {
    dispatch({ type: 'SET_OPERATION_ERROR', payload: error });
  };
  
  const setOperationSuccess = (success: string | null) => {
    dispatch({ type: 'SET_OPERATION_SUCCESS', payload: success });
  };
  
  const setSelectedStake = (stake: number) => {
    dispatch({ type: 'SET_SELECTED_STAKE', payload: stake });
  };
  
  const setConnectionStatus = (status: BMGBRState['connectionStatus']) => {
    dispatch({ type: 'SET_CONNECTION_STATUS', payload: status });
  };
  
  const setWebsocketLogs = (logs: BMGBRState['websocketLogs']) => {
    dispatch({ type: 'SET_WEBSOCKET_LOGS', payload: logs });
  };
  
  const setLastTenResults = (results: BMGBRState['lastTenResults']) => {
    dispatch({ type: 'SET_LAST_TEN_RESULTS', payload: results });
  };
  
  const resetAll = () => {
    dispatch({ type: 'RESET_ALL' });
  };
  
  return {
    state,
    dispatch,
    // Funções de conveniência
    setOperating,
    setOperationError,
    setOperationSuccess,
    setSelectedStake,
    setConnectionStatus,
    setWebsocketLogs,
    setLastTenResults,
    resetAll,
  };
} 