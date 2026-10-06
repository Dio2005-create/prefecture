import axios from 'axios';
import type { ChatConversation, CitizenRequest, Document, PaginatedDocuments, PrefectureService, RagResponse, RequestRequirements, SearchHit, RequestType } from '../types';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000' });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('archives-session');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use((response) => response, (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status === 401 && localStorage.getItem('archives-session')) {
    localStorage.removeItem('archives-session');
    localStorage.removeItem('archives-last-activity');
    window.dispatchEvent(new Event('archives:session-expired'));
  }
  return Promise.reject(error);
});
export const authService = {
  register: async (payload: { email: string; password: string; phone?: string; cin?: string; nom?: string }) =>
    (await api.post<{ token: string; user?: unknown }>('/auth/register', payload)).data,
  login: async (identifier: string, password: string) => (await api.post<{ token: string; user?: unknown }>('/auth/login', { identifier, password })).data,
  validate: async (token: string) => (await api.post('/auth/validate', {}, { headers: { Authorization: `Bearer ${token}` } })).data,
  logout: async (token: string | null) => { if (token) await api.post('/auth/logout', {}, { headers: { Authorization: `Bearer ${token}` } }); },
  changePassword: async (currentPassword: string, newPassword: string) =>
    (await api.post<{ success: boolean; message: string }>('/auth/change-password', { currentPassword, newPassword })).data,
  updateProfile: async (payload: { nom: string; email: string; phone: string; cin: string }) =>
    (await api.patch<{ success: boolean; user: unknown }>('/auth/profile', payload)).data,
};

export const prefectureService = {
  listServices: async () => (await api.get<PrefectureService[]>('/requests/services')).data,
  requirements: async (type: RequestType) => (await api.get<RequestRequirements>(`/requests/requirements/${type}`)).data,
  listFees: async () => (await api.get<Partial<Record<RequestType, number>>>('/requests/fees')).data,
  listRequests: async () => (await api.get<CitizenRequest[]>('/requests')).data,
  createRequest: async (payload: { serviceId: string; type: string; title?: string; description?: string; formData?: Record<string, unknown> }) =>
    (await api.post<CitizenRequest>('/requests', payload)).data,
  createMultipartRequest: async (payload: { serviceId: string; type: string; title?: string; description?: string; formData: Record<string, unknown>; files: Array<{ requirement: string; file: File }>; paymentConfirmed: boolean; paymentProvider?: 'MVOLA' | 'AIRTEL_MONEY' | 'ORANGE_MONEY'; paymentPhone?: string; confirmedAmount: number }) => {
    const form = new FormData();
    form.append('serviceId', payload.serviceId);
    form.append('type', payload.type);
    if (payload.title) form.append('title', payload.title);
    if (payload.description) form.append('description', payload.description);
    form.append('formData', JSON.stringify(payload.formData));
    form.append('attachmentLabels', JSON.stringify(payload.files.map((item) => item.requirement)));
    form.append('paymentConfirmed', String(payload.paymentConfirmed));
    form.append('confirmedAmount', String(payload.confirmedAmount));
    if (payload.paymentProvider) form.append('paymentProvider', payload.paymentProvider);
    if (payload.paymentPhone) form.append('paymentPhone', payload.paymentPhone);
    payload.files.forEach((item) => form.append('attachments', item.file));
    return (await api.post<CitizenRequest>('/requests/multipart', form)).data;
  },
  addAttachment: async (requestId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return (await api.post(`/requests/${requestId}/attachments`, form)).data;
  },
  downloadAttachment: async (requestId: string, attachmentId: string) =>
    (await api.get<Blob>(`/requests/${requestId}/attachments/${attachmentId}`, { responseType: 'blob' })).data,
  downloadPdf: async (requestId: string) => (await api.get<Blob>(`/requests/${requestId}/pdf`, { responseType: 'blob' })).data,
  stats: async () => (await api.get<{ total: number; inProgress: number; approved: number; rejected: number }>('/requests/stats')).data,
};

export const notificationService = {
  list: async () => (await api.get('/notifications')).data,
  markAsRead: async (id: string) => (await api.patch(`/notifications/${id}/read`)).data,
};

export const appointmentService = {
  available: async () => (await api.get('/appointments/available')).data,
  list: async () => (await api.get('/appointments')).data,
  book: async (payload: { startsAt: string; requestId?: string; notes?: string }) => (await api.post('/appointments', payload)).data,
  cancel: async (id: string) => (await api.delete(`/appointments/${id}`)).data,
  listForAdmin: async () => (await api.get('/appointments/admin')).data,
  updateStatus: async (id: string, status: 'BOOKED' | 'CANCELLED' | 'COMPLETED') => (await api.patch(`/appointments/admin/${id}/status`, { status })).data,
};

export const userService = {
  list: async () => (await api.get<Array<{ id: string; email: string; nom: string | null; role: string; status: string; createdAt: string }>>('/users')).data,
};

export const adminService = {
  getStats: async () =>
    (await api.get<{ total: number; pending: number; approved: number; rejected: number }>('/admin/stats')).data,
  listRequests: async (status?: string) =>
    (await api.get<CitizenRequest[]>('/admin/requests', { params: status ? { status } : undefined })).data,
  hideRequest: async (id: string) => (await api.delete(`/admin/requests/${id}/view`)).data,
  approveRequest: async (id: string, notes?: string) =>
    (await api.post<CitizenRequest>(`/admin/requests/${id}/approve`, { notes })).data,
  rejectRequest: async (id: string, reason: string) =>
    (await api.post<CitizenRequest>(`/admin/requests/${id}/reject`, { reason })).data,
  requestMoreInfo: async (id: string, infoNeeded: string) =>
    (await api.post<CitizenRequest>(`/admin/requests/${id}/request-info`, { infoNeeded })).data,
  updateRequest: async (id: string, payload: { formData: Record<string, unknown>; title?: string; description?: string }) =>
    (await api.patch<CitizenRequest>(`/admin/requests/${id}`, payload)).data,
  downloadAttachment: async (requestId: string, attachmentId: string) =>
    (await api.get<Blob>(`/requests/${requestId}/attachments/${attachmentId}`, { responseType: 'blob' })).data,
  submitForReview: async (id: string, notes?: string) =>
    (await api.post<CitizenRequest>(`/admin/requests/${id}/submit-review`, { notes })).data,
  validateByChief: async (id: string, notes?: string) =>
    (await api.post<CitizenRequest>(`/admin/requests/${id}/validate`, { notes })).data,
  listTemplates: async () => (await api.get<Array<{ id: string; requestType: string; name: string; bodyText?: string; originalName?: string; mimeType?: string; isActive: boolean }>>('/admin/templates')).data,
  saveTemplate: async (file: File, fields: { requestType: string; name: string; bodyText: string }) => {
    const form = new FormData();
    form.append('file', file);
    form.append('requestType', fields.requestType);
    form.append('name', fields.name);
    form.append('bodyText', fields.bodyText);
    return (await api.post('/admin/templates', form)).data;
  },
  activateTemplate: async (id: string) => (await api.post(`/admin/templates/${id}/activate`)).data,
  deactivateTemplate: async (id: string) => (await api.post(`/admin/templates/${id}/deactivate`)).data,
  deleteTemplate: async (id: string) => (await api.delete(`/admin/templates/${id}`)).data,
  listMarks: async () => (await api.get<Array<{ id: string; name: string; kind: string; mimeType?: string; isActive: boolean }>>('/admin/marks')).data,
  uploadMark: async (file: File, fields: { name: string; kind: string }) => {
    const form = new FormData();
    form.append('file', file);
    form.append('name', fields.name);
    form.append('kind', fields.kind);
    return (await api.post('/admin/marks', form)).data;
  },
  deactivateMark: async (id: string) => (await api.post(`/admin/marks/${id}/deactivate`)).data,
  activateMark: async (id: string) => (await api.post(`/admin/marks/${id}/activate`)).data,
  deleteMark: async (id: string) => (await api.delete(`/admin/marks/${id}`)).data,
  listSettings: async () => (await api.get<Array<{ key: string; value: string }>>('/admin/settings')).data,
  updateSettings: async (payload: Record<string, string>) => (await api.patch('/admin/settings', payload)).data,
  createAdmin: async (payload: { email: string; password: string; nom: string; phone: string }) => (await api.post('/users/admins', payload)).data,
};

export const documentService = {
  list: async (params: Record<string, string | number | undefined>) =>
    (await api.get<PaginatedDocuments>('/documents', { params })).data,
  get: async (id: string) => (await api.get<Document>(`/documents/${id}`)).data,
  upload: async (file: File, fields: { type: string; titre?: string }) => {
    const form = new FormData();
    form.append('file', file);
    form.append('type', fields.type);
    if (fields.titre) form.append('titre', fields.titre);
    return (await api.post<Document>('/documents/upload', form)).data;
  },
  index: async (id: string) => (await api.post<Document>(`/documents/${id}/index`)).data,
  remove: async (id: string) => api.delete(`/documents/${id}`),
  publicList: async () => (await api.get<Document[]>('/documents/public')).data,
};

export const searchService = {
  semantic: async (query: string, topK = 10) =>
    (await api.post<SearchHit[]>('/rag/search', { query, topK })).data,
};

export const ragService = {
  ask: async (query: string, topK = 5, conversationId?: string) =>
    (await api.post<RagResponse>('/rag/ask', { query, topK, conversationId })).data,
  history: async () => (await api.get<ChatConversation[]>('/rag/history')).data,
  rename: async (id: string, titre: string) =>
    (await api.patch<Pick<ChatConversation, 'id' | 'titre' | 'updatedAt'>>(`/rag/history/${id}`, { titre })).data,
  remove: async (id: string) => (await api.delete<{ success: boolean }>(`/rag/history/${id}`)).data,
};
