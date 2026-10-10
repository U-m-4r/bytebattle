import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import apiClient from '../api/client';

const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      isLoading: false,
      error: null,

      login: async (credentials) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await apiClient.post('/auth/login', credentials);
          set({ user: data.user, token: data.token, isLoading: false });
        } catch (err) {
          set({
            error: err.response?.data?.error?.message || 'Login failed',
            isLoading: false,
          });
        }
      },

      register: async (userData) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await apiClient.post('/auth/register', userData);
          set({ user: data.user, token: data.token, isLoading: false });
        } catch (err) {
          set({
            error: err.response?.data?.error?.message || 'Registration failed',
            isLoading: false,
          });
        }
      },

      googleSignIn: async (credential) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await apiClient.post('/auth/google', { credential });
          set({ user: data.user, token: data.token, isLoading: false });
        } catch (err) {
          set({
            error: err.response?.data?.error?.message || 'Google sign-in failed',
            isLoading: false,
          });
        }
      },

      logout: () => set({ user: null, token: null, error: null }),

      clearError: () => set({ error: null }),

      fetchMe: async () => {
        try {
          const { data } = await apiClient.get('/auth/me');
          set({ user: data.user });
        } catch {
          // ignore — user may not be logged in
        }
      },
    }),
    {
      name: 'bytebattle-auth',
      // Only persist user and token, not loading/error state
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
);

export default useAuthStore;
