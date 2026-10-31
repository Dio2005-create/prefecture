import axios from 'axios';
import type { ChatConversation, CitizenComplaint, CitizenRequest, Document, FirearmPermitRecord, FirearmRecord, FirearmRequestRecord, FirearmRequestType, NotificationItem, PaginatedDocuments, PrefectureService, RagResponse, RequestRequirements, SearchHit, RequestType } from '../types';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000' });
export function getSessionKeys(pathname = window.location.pathname) {
  const adminPortal = pathname.startsWith('/back') || pathname === '/login/admin';
  return adminPortal
    ? { session: 'archives-session-admin', activity: 'archives-last-activity-admin' }
    : { session: 'archives-session-citizen', activity: 'archives-last-activity-citizen' };
}

api.interceptors.request.use((config) => {
  if (!config.headers.Authorization) {
    const token = localStorage.getItem(getSessionKeys().session);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
api.interceptors.response.use((response) => response, (error: unknown) => {
  if (axios.isAxiosError(error) && !error.response && error.code !== 'ERR_CANCELED') {
    window.dispatchEvent(new Event('archives:connection-error'));
  }
  const isLoginRequest = axios.isAxiosError(error) &&
    (error.config?.url === '/auth/login' || error.config?.url === '/auth/admin-login');
  if (axios.isAxiosError(error) && error.response?.status === 401 && !isLoginRequest) {
    const keys = getSessionKeys();
    localStorage.removeItem(keys.session);
    localStorage.removeItem(keys.activity);
    window.dispatchEvent(new Event('archives:session-expired'));
  }
  return Promise.reject(error);
});
export const authService = {
  register: async (payload: { email?: string; password: string; phone?: string; cin?: string; nom?: string; isAdult: boolean }) =>
    (await api.post<{ token: string; user?: unknown }>('/auth/register', payload)).data,
  login: async (identifier: string, password: string, adminPortal = false) =>
    (await api.post<{ token: string; user?: unknown }>(adminPortal ? '/auth/admin-login' : '/auth/login', { identifier, password })).data,
  requestReactivation: async (payload: { identifier: string; password: string; reason?: string }) =>
    (await api.post<{ success: boolean; message: string }>('/auth/request-reactivation', payload)).data,
  requestPasswordReset: async (identifier: string, channel: 'EMAIL' | 'SMS' | 'CIN') =>
    (await api.post<{ success: boolean; requiresOtp: boolean; channel?: 'EMAIL' | 'SMS' | 'CIN'; message: string }>('/auth/password-reset/request', { identifier, channel })).data,
  resetPassword: async (payload: { identifier: string; code: string; password: string }) =>
    (await api.post<{ success: boolean; message: string }>('/auth/password-reset/confirm', payload)).data,
  validate: async (token: string) => (await api.post('/auth/validate', {}, { headers: { Authorization: `Bearer ${token}` } })).data,
  logout: async (token: string | null) => { if (token) await api.post('/auth/logout', {}, { headers: { Authorization: `Bearer ${token}` } }); },
  changePassword: async (currentPassword: string, newPassword: string) =>
    (await api.post<{ success: boolean; message: string }>('/auth/change-password', { currentPassword, newPassword })).data,
  updateProfile: async (payload: { nom: string; email: string; phone: string; cin: string }) =>
    (await api.patch<{ success: boolean; user: unknown }>('/auth/profile', payload)).data,
  updateLocale: async (locale: 'fr' | 'mg') =>
    (await api.patch<{ success: boolean; user: unknown }>('/auth/preferences', { locale })).data,
};

export const prefectureService = {
  listServices: async () => (await api.get<PrefectureService[]>('/requests/services')).data,
  requirements: async (type: RequestType, motif?: string, formData?: Record<string, unknown>) =>
    (await api.get<RequestRequirements>(`/requests/requirements/${type}`, { params: { ...(motif ? { motif } : {}), ...(formData ? { formData: JSON.stringify(formData) } : {}) } })).data,
  listFees: async () => (await api.get<Partial<Record<RequestType, number>>>('/requests/fees')).data,
  listRequests: async () => (await api.get<CitizenRequest[]>('/requests')).data,
  createRequest: async (payload: { serviceId: string; type: string; title?: string; description?: string; formData?: Record<string, unknown> }) =>
    (await api.post<CitizenRequest>('/requests', payload)).data,
  createMultipartRequest: async (payload: { serviceId: string; type: string; title?: string; description?: string; formData: Record<string, unknown>; files: Array<{ requirement: string; file: File }>; paymentConfirmed: boolean; paymentProvider?: 'MVOLA' | 'AIRTEL_MONEY' | 'ORANGE_MONEY'; paymentPhone?: string; confirmedAmount: number; simulationPin?: string }) => {
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
    if (payload.simulationPin) form.append('simulationPin', payload.simulationPin);
    payload.files.forEach((item) => form.append('attachments', item.file));
    return (await api.post<CitizenRequest>('/requests/multipart', form)).data;
  },
  addAttachment: async (requestId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return (await api.post(`/requests/${requestId}/attachments`, form)).data;
  },
  addCitizenAttachment: async (requestId: string, file: File, label: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('label', label);
    return (await api.post(`/requests/${requestId}/attachments`, form)).data;
  },
  replaceCitizenAttachment: async (requestId: string, attachmentId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return (await api.patch(`/requests/${requestId}/attachments/${attachmentId}`, form)).data;
  },
  updateCitizenRequest: async (requestId: string, payload: { title: string; description: string; formData: Record<string, unknown> }) =>
    (await api.patch<CitizenRequest>(`/requests/${requestId}`, payload)).data,
  downloadAttachment: async (requestId: string, attachmentId: string) =>
    (await api.get<Blob>(`/requests/${requestId}/attachments/${attachmentId}`, { responseType: 'blob' })).data,
  downloadPdf: async (requestId: string) => (await api.get<Blob>(`/requests/${requestId}/pdf`, { responseType: 'blob' })).data,
  downloadCorrectedPdf: async (requestId: string) => (await api.get<Blob>(`/requests/${requestId}/pdf`, { responseType: 'blob' })).data,
  stats: async () => (await api.get<{ total: number; inProgress: number; approved: number; rejected: number }>('/requests/stats')).data,
};

export const notificationService = {
  list: async () => (await api.get<NotificationItem[]>('/notifications')).data,
  markAsRead: async (id: string) => (await api.patch(`/notifications/${id}/read`)).data,
};

export const complaintService = {
  eligibleDocuments: async () => (await api.get<Array<{ id: string; title: string | null; type: string; updatedAt: string; service: { nameFr: string; nameMg: string } }>>('/complaints/documents')).data,
  list: async () => (await api.get<CitizenComplaint[]>('/complaints')).data,
  create: async (payload: { documentRequestId: string; reason: string; details?: string; file: File }) => {
    const form = new FormData();
    form.append('documentRequestId', payload.documentRequestId);
    form.append('reason', payload.reason);
    if (payload.details) form.append('details', payload.details);
    form.append('file', payload.file);
    return (await api.post('/complaints', form)).data;
  },
  listAdmin: async () => (await api.get<CitizenComplaint[]>('/complaints/admin')).data,
  markInReview: async (id: string) => (await api.patch(`/complaints/${id}/review`)).data,
  resolve: async (id: string, corrections: Record<string, string>, response: string) =>
    (await api.post(`/complaints/${id}/resolve`, { corrections, response })).data,
  reject: async (id: string, response: string) =>
    (await api.post(`/complaints/${id}/reject`, { response })).data,
  downloadAttachment: async (id: string, attachmentId: string) =>
    (await api.get<Blob>(`/complaints/${id}/attachments/${attachmentId}`, { responseType: 'blob' })).data,
};

export const firearmsService = {
  listMine: async () => (await api.get<FirearmRecord[]>('/firearms')).data,
  listMyPermits: async () => (await api.get<FirearmPermitRecord[]>('/firearms/permits')).data,
  listMyRequests: async () => (await api.get<FirearmRequestRecord[]>('/firearms/requests')).data,
  createRequest: async (payload: { type: FirearmRequestType; data: Record<string, string>; files: File[] }) => {
    const form = new FormData();
    form.append('type', payload.type);
    form.append('data', JSON.stringify(payload.data));
    form.append('attachmentLabels', JSON.stringify(payload.files.map((_, index) => `Justificatif ${index + 1}`)));
    payload.files.forEach((file) => form.append('attachments', file));
    return (await api.post<FirearmRequestRecord>('/firearms/requests', form)).data;
  },
  downloadAttachment: async (requestId: string, attachmentId: string) =>
    (await api.get<Blob>(`/firearms/requests/${requestId}/attachments/${attachmentId}`, { responseType: 'blob' })).data,
  downloadOfficialDocument: async (requestId: string) =>
    (await api.get<Blob>(`/firearms/requests/${requestId}/document`, { responseType: 'blob' })).data,
  listAdminRequests: async (status?: string) =>
    (await api.get<FirearmRequestRecord[]>('/firearms/admin/requests', { params: status ? { status } : undefined })).data,
  decideRequest: async (id: string, payload: { status: 'IN_REVIEW' | 'NEEDS_INFO' | 'APPROVED' | 'REJECTED'; comment?: string; expiresAt?: string }) =>
    (await api.patch<FirearmRequestRecord>(`/firearms/admin/requests/${id}/decision`, payload)).data,
  getDossier: async (userId: string) =>
    (await api.get<{ id: string; nom: string | null; email: string | null; phone: string | null; cin: string | null; firearms: FirearmRecord[]; firearmRequests: FirearmRequestRecord[] }>(`/firearms/admin/citizens/${userId}`)).data,
  searchBySerial: async (serial: string) =>
    (await api.get<FirearmRecord & { owner: { id: string; nom: string | null; cin: string | null }; history: Array<{ action: string; details: Record<string, unknown>; createdAt: string }> }>('/firearms/admin/search', { params: { serial } })).data,
  stats: async () =>
    (await api.get<{ firearms: number; activeFirearms: number; requests: number; pendingRequests: number; activePermits: number; expiringPermits: number; firearmBalance: number; firearmFees: Record<string, number>; requestsByStatus: Record<string, number>; firearmsByType: Array<{ weaponType: string; count: number }> }>('/firearms/admin/stats')).data,
  downloadReport: async () =>
    (await api.get<Blob>('/firearms/admin/report.csv', { responseType: 'blob' })).data,
};

export const appointmentService = {
  available: async (date?: string) => (await api.get('/appointments/available', { params: date ? { date } : undefined })).data,
  list: async () => (await api.get('/appointments')).data,
  downloadTicket: async (id: string) => {
    const response = await api.get<Blob>(`/appointments/${id}/ticket`, { responseType: 'blob' });
    const disposition = String(response.headers['content-disposition'] ?? '');
    const encodedFilename = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
    const plainFilename = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
    return {
      pdf: response.data,
      filename: encodedFilename ? decodeURIComponent(encodedFilename) : plainFilename ?? `ticket-rdv-${id}.pdf`,
    };
  },
  book: async (payload: { slotId: string; requestId?: string; notes?: string }) => (await api.post('/appointments', payload)).data,
  cancel: async (id: string) => (await api.delete(`/appointments/${id}`)).data,
  listForAdmin: async () => (await api.get<Array<{
    id: string;
    ticketReference: string | null;
    startsAt: string;
    endsAt: string;
    office: string;
    status: string;
    user?: { nom: string | null; email: string | null };
    request?: { type: string; title: string | null; service: { nameFr: string } } | null;
  }>>('/appointments/admin')).data,
  updateStatus: async (id: string, status: 'BOOKED' | 'CANCELLED' | 'COMPLETED') => (await api.patch(`/appointments/admin/${id}/status`, { status })).data,
  listAvailabilityForAdmin: async () => (await api.get('/appointments/admin/availability')).data,
  createAvailability: async (payload: { date: string; startTime: string; endTime: string; slotDurationMinutes: number; breakStart?: string; breakEnd?: string; office?: string }) =>
    (await api.post('/appointments/admin/availability', payload)).data,
  listSlotsForAdmin: async () => (await api.get('/appointments/admin/slots')).data,
  createSlot: async (payload: { startsAt: string; endsAt: string; office?: string }) => (await api.post('/appointments/admin/slots', payload)).data,
  updateSlot: async (id: string, isActive: boolean) => (await api.patch(`/appointments/admin/slots/${id}`, { isActive })).data,
};

export const userService = {
  list: async () => (await api.get<Array<{ id: string; email: string | null; nom: string | null; phone: string | null; role: string; status: string; createdAt: string; roles?: Array<{ role: { name: string } }>; _count: { firearms: number } }>>('/users')).data,
  updateCitizenStatus: async (id: string, status: 'ACTIVE' | 'DISABLED') =>
    (await api.patch<{ id: string; email: string | null; nom: string | null; role: string; status: string }>(`/users/${id}/status`, { status })).data,
  reactivationRequests: async () => (await api.get<Array<{ id: string; reason: string | null; status: string; createdAt: string; user: { id: string; nom: string | null; email: string | null; phone: string | null; status: string } }>>('/users/reactivations')).data,
  decideReactivation: async (id: string, decision: 'APPROVED' | 'REJECTED') =>
    (await api.post(`/users/reactivations/${id}/decision`, { decision })).data,
  passwordResetRequests: async () => (await api.get<Array<{
    id: string;
    status: string;
    createdAt: string;
    user: { id: string; nom: string | null; cin: string | null; email: string | null; phone: string | null };
  }>>('/users/password-reset-requests')).data,
  issueTemporaryPassword: async (id: string, identityVerified: boolean) => (await api.post<{
    requestId: string;
    temporaryPassword: string;
    expiresAt: string;
    message: string;
  }>(`/users/password-reset-requests/${id}/temporary-password`, { identityVerified })).data,
};

export const adminService = {
  getStats: async () =>
    (await api.get<{
      total: number; pending: number; approved: number; rejected: number;
      totalUsers: number; citizens: number; administrators: number; activeUsers: number; paymentBalance: number;
      monthlySeries: Array<{ month: string; requests: number; users: number }>;
    }>('/admin/stats')).data,
  listRequests: async (status?: string) =>
    (await api.get<CitizenRequest[]>('/admin/requests', { params: status ? { status } : undefined })).data,
  hideRequest: async (id: string) => (await api.delete(`/admin/requests/${id}/view`)).data,
  approveRequest: async (
    id: string,
    notes?: string,
    certificateAdministration?: {
      certificateNumber: string;
      reference: string;
      fee: string;
      receiptNumber: string;
      issueLocation: string;
    },
  ) =>
    (await api.post<CitizenRequest>(`/admin/requests/${id}/approve`, { notes, ...(certificateAdministration ? { certificateAdministration } : {}) })).data,
  assignCinAppointment: async (requestId: string, slotId: string) =>
    (await api.post('/appointments/admin/requests/' + requestId + '/cin-appointment', { slotId })).data,
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
  saveTemplate: async (file: File, fields: { requestType: string; name: string; bodyText?: string }) => {
    const form = new FormData();
    form.append('file', file);
    form.append('requestType', fields.requestType);
    form.append('name', fields.name);
    if (fields.bodyText) form.append('bodyText', fields.bodyText);
    return (await api.post('/admin/templates', form)).data;
  },
  activateTemplate: async (id: string) => (await api.post(`/admin/templates/${id}/activate`)).data,
  deactivateTemplate: async (id: string) => (await api.post(`/admin/templates/${id}/deactivate`)).data,
  deleteTemplate: async (id: string) => (await api.delete(`/admin/templates/${id}`)).data,
  listMarks: async () => (await api.get<Array<{ id: string; name: string; kind: string; mimeType?: string; isActive: boolean }>>('/admin/marks')).data,
  previewMark: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return (await api.post<Blob>('/admin/marks/preview', form, { responseType: 'blob' })).data;
  },
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
  publicList: async (params: Record<string, string | undefined> = {}) =>
    (await api.get<Document[]>('/documents/public', { params })).data,
  publications: async (params: Record<string, string | undefined> = {}) =>
    (await api.get<Document[]>('/documents/publications', { params })).data,
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
