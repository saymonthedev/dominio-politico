-- Picos de carga do banco (relógio dos mundos rodando junto com as jogadas)
-- passavam do limite padrão de 8 s e a jogada falhava com "statement timeout".
-- Jogadores logados ganham margem; o anônimo continua curto.
alter role authenticated set statement_timeout = '15s';
notify pgrst, 'reload config';
