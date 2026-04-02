/**
 * Axios API client with error handling.
 */

import axios from "axios";
import { API_BASE } from "../constants";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 5000,
  headers: { "Content-Type": "application/json" },
});

// Response interceptor for error logging
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.detail || err.message;
    console.error(`[API Error] ${err.config?.method?.toUpperCase()} ${err.config?.url}: ${msg}`);
    return Promise.reject(err);
  }
);

export default api;
