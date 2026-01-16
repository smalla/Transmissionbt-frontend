import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Important for session cookies
  headers: {
    'Content-Type': 'application/json'
  }
});

// CSRF token cache
let csrfToken = null;

// Request interceptor to add CSRF token to non-GET requests
apiClient.interceptors.request.use(
  async (config) => {
    // Only add CSRF token to state-changing requests
    if (config.method && !['get', 'head', 'options'].includes(config.method.toLowerCase())) {
      // Fetch CSRF token if we don't have one
      if (!csrfToken) {
        try {
          const response = await axios.get(`${API_BASE_URL}/csrf-token`, { withCredentials: true });
          csrfToken = response.data.csrfToken;
        } catch (err) {
          console.error('Failed to fetch CSRF token:', err);
        }
      }
      
      // Add CSRF token to headers
      if (csrfToken) {
        config.headers['x-csrf-token'] = csrfToken;
      }
    }
    
    // If request data is FormData, remove Content-Type to let axios set it with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for handling auth errors and CSRF token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // If CSRF token is invalid, clear it and retry once
    if (error.response?.status === 403 && error.config && !error.config._retry) {
      csrfToken = null;
      const originalRequest = error.config;
      originalRequest._retry = true;
      return apiClient(originalRequest);
    }
    
    // Don't intercept - let components handle auth errors
    return Promise.reject(error);
  }
);

export default apiClient;
