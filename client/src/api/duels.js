import apiClient from './client';

export const createDuel = (data) => apiClient.post('/duels', data);
export const joinDuel = (duelId) => apiClient.post('/duels/' + duelId + '/join');
export const getInviteInfo = (duelId) => apiClient.get('/duels/' + duelId + '/invite');
export const getDuel = (duelId) => apiClient.get('/duels/' + duelId);
export const cancelDuel = (duelId) => apiClient.delete('/duels/' + duelId);
export const submitToDuel = (duelId, data) =>
  apiClient.post('/duels/' + duelId + '/submit', data);
