// Reexporta os tipos publicados pelo backend (src/backend/protocolo/tipos.ts).
// Os tipos do protocolo nunca são redefinidos no frontend (arquitetura do frontend, §5.1).
export * from '@protocolo';
// Contrato da listagem de corridas ainda não publicado pelo backend (ver ./corridas.ts).
export * from './corridas';
