import { io } from 'socket.io-client';
import useAuthStore from '../store/authStore';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io('/', {
      auth: { token: useAuthStore.getState().token },
      autoConnect: false,
      transports: ['websocket'],
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
