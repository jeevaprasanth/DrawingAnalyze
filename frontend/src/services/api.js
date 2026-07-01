import axios from 'axios';

// ✅ Create axios instance
const api = axios.create({
  baseURL: 'https://drawinganalyze.onrender.com/api', // ✅ FIX 1: point to backend
});

// =============================
// 📊 Dashboard
// =============================
export const getDashboardStats = () => api.get('/dashboard/stats');

// =============================
// 📄 PDF Upload & Management
// =============================
export const checkDuplicate = (fileName) =>
  api.post('/pdf/check-duplicate', { fileName });

export const uploadPDF = (formData, onUploadProgress) => {
  return api.post('/pdf/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data', // ✅ FIX 2: required for file upload
    },
    onUploadProgress,
  });
};

export const uploadMultiplePDFs = (formData, onUploadProgress) => {
  return api.post('/pdf/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress,
  });
};

export const getUploadedFiles = () => api.get('/pdf/files');

export const deleteFile = (fileId) => api.delete(`/pdf/${fileId}`);

// =============================
// 📈 Results
// =============================
export const getResultsByFileId = (fileId) =>
  api.get(`/results/${fileId}`);

export const getAllResults = () => api.get('/results');

export const exportAllResults = () => api.get('/results/export/all');

export const exportSelectedResults = (fileIds) =>
  api.post('/results/export/selected', { fileIds });

// =============================
// � Smart Search
// =============================
export const searchResults = (query) =>
  api.get(`/results/search?q=${encodeURIComponent(query)}`);

// =============================
// �🕘 History
// =============================
export const getHistory = () => api.get('/history');

export const deleteAllFiles = () => api.delete('/pdf/delete-all');

// =============================
// 💬 Chat Assistant
// =============================
export const sendChatMessage = async (message, conversationHistory = [], sessionId = null) => {
  try {
    const response = await api.post('/chat/message', { 
      message,
      conversationHistory,
      sessionId
    });
    return response.data;
  } catch (error) {
    console.error('Chat API error:', error);
    return {
      success: false,
      message: 'Failed to connect to chat service'
    };
  }
};

// =============================
// 📜 Chat History
// =============================
export const getChatSessions = () => api.get('/chat/sessions');

export const getChatSession = (sessionId) => api.get(`/chat/sessions/${sessionId}`);

export const createChatSession = (title) => api.post('/chat/sessions', { title });

export const saveChatMessage = (sessionId, role, content, language) =>
  api.post(`/chat/sessions/${sessionId}/messages`, { role, content, language });

export const deleteChatSession = (sessionId) => api.delete(`/chat/sessions/${sessionId}`);

export const clearAllChatHistory = () => api.delete('/chat/sessions');

// =============================
// 📄 PDF Chat Context
// =============================
export const uploadPDFForChat = (sessionId, formData) => {
  formData.append('sessionId', sessionId);
  return api.post(`/chat/context/pdf`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    }
  });
};

export const getChatPDFContext = (sessionId) =>
  api.get(`/chat/context/${sessionId}`);

export const deleteChatPDFContext = (contextId) =>
  api.delete(`/chat/context/${contextId}`);

export default api;
