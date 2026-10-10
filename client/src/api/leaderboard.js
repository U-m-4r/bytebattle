import apiClient from './client';

export const getLeaderboard = (page = 1) =>
  apiClient.get(`/leaderboard?page=${page}&limit=20`);

export const getUserProfile = (username) =>
  apiClient.get(`/users/${username}`);

export const getMatchHistory = (username, page = 1, limit = 10) =>
  apiClient.get(`/users/${username}/history?page=${page}&limit=${limit}`);
