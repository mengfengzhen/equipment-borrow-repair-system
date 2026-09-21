import axios from 'axios';

const defaultApiBaseUrl =
  window.location.port === '5173' ? `http://${window.location.hostname}:3000/api` : '/api';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl;

export const http = axios.create({
  baseURL: API_BASE_URL,
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.message || error.message || '请求失败';
    return Promise.reject(new Error(Array.isArray(message) ? message.join('，') : message));
  },
);
