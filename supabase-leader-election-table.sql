-- 🏆 TABELA PARA LEADER ELECTION DO SISTEMA INSIGHTS
-- Execute este SQL no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS system_leader (
  service TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  last_heartbeat TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_system_leader_heartbeat ON system_leader(last_heartbeat);

-- RLS (Row Level Security) - permitir acesso público para o sistema
ALTER TABLE system_leader ENABLE ROW LEVEL SECURITY;

-- Política para permitir operações do sistema (leitura, inserção, atualização)
CREATE POLICY "Enable all operations for system_leader" ON system_leader
    FOR ALL USING (true)
    WITH CHECK (true);

-- Comentários para documentação
COMMENT ON TABLE system_leader IS 'Tabela para coordenar eleição de leader entre instâncias do sistema';
COMMENT ON COLUMN system_leader.service IS 'Nome do serviço (ex: insights-collector)';
COMMENT ON COLUMN system_leader.instance_id IS 'ID único da instância (FLY_MACHINE_ID)';
COMMENT ON COLUMN system_leader.last_heartbeat IS 'Último heartbeat da instância leader'; 