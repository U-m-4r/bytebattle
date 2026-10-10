import apiClient from './client';

export const getProblems = () => apiClient.get('/problems');
export const getProblem = (slug) => apiClient.get(`/problems/${slug}`);
export const submitSolution = (data) => apiClient.post('/submissions', data);
export const getMySubmissions = () => apiClient.get('/submissions/mine');
