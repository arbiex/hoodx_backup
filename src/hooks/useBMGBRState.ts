import { useReducer, useEffect } from 'react';

// Tipos de estado
export interface BMGBRState {
  isOperating: boolean;
  operationError: string | null;
  operationSuccess: string | null;
  selectedStake: number;
  martingaleSequence: number[];
  connectionStatus: 'INATIVO' | 'CONECTANDO' | 'CONECTADO' | 'EM_OPERACAO';
  websocketLogs: Array<{
    timestamp: string;
    message: string;
    type: 'info' | 'error' | 'success';
  }>;
  lastTenResults: Array<{
    crash_point: number;
    timestamp: string;
    game_id: string;
  }>;
}

// Estado inicial
const initialState: BMGBRState = {
  isOperating: false,
  operationError: null,
  operationSuccess: null,
  selectedStake: 0.5,
  martingaleSequence: [],
  connectionStatus: 'INATIVO',
  websocketLogs: [],
  lastTenResults: []
};

// Tipos de ação
type BMGBRAction =
  | { type: 'SET_OPERATING'; payload: boolean }
  | { type: 'SET_OPERATION_ERROR'; payload: string | null }
  | { type: 'SET_OPERATION_SUCCESS'; payload: string | null }
  | { type: 'SET_SELECTED_STAKE'; payload: number }
  | { type: 'SET_MARTINGALE_SEQUENCE'; payload: number[] }
  | { type: 'SET_CONNECTION_STATUS'; payload: BMGBRState['connectionStatus'] }
  | { type: 'SET_WEBSOCKET_LOGS'; payload: BMGBRState['websocketLogs'] }
  | { type: 'SET_LAST_TEN_RESULTS'; payload: BMGBRState['lastTenResults'] }
  | { type: 'RESET_ALL' };

// Reducer
function bmgbrReducer(state: BMGBRState, action: BMGBRAction): BMGBRState {
  switch (action.type) {
    case 'SET_OPERATING':
      return { ...state, isOperating: action.payload };
    case 'SET_OPERATION_ERROR':
      return { ...state, operationError: action.payload };
    case 'SET_OPERATION_SUCCESS':
      return { ...state, operationSuccess: action.payload };
    case 'SET_SELECTED_STAKE':
      return { ...state, selectedStake: action.payload };
    case 'SET_MARTINGALE_SEQUENCE':
      return { ...state, martingaleSequence: action.payload };
    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: action.payload };
    case 'SET_WEBSOCKET_LOGS':
      return { ...state, websocketLogs: action.payload };
    case 'SET_LAST_TEN_RESULTS':
      return { ...state, lastTenResults: action.payload };
    case 'RESET_ALL':
      return initialState;
    default:
      return state;
  }
}

// Função para calcular sequência de martingale
function calculateMartingaleSequence(baseStake: number): number[] {
  const sequence = [];
  const currentStake = baseStake;
  
  // M1 e M2 com multiplicadores diferentes
  sequence.push(currentStake); // M1
  sequence.push(currentStake * 2.5); // M2
  
  return sequence;
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