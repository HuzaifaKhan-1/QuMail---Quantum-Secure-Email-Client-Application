import { apiRequest } from "./queryClient";
import type { User, Message, QuantumKey, KeyPoolStats, AuditLog, SendEmailRequest } from "./types";

export const api = {
  // Authentication
  async register(userData: { username: string; email: string; password: string }) {
    const response = await apiRequest("POST", "/api/auth/register", userData);
    return response.json();
  },

  async login(credentials: { email: string; password: string }) {
    const response = await apiRequest("POST", "/api/auth/login", credentials);
    return response.json();
  },

  async logout() {
    const response = await apiRequest("POST", "/api/auth/logout");
    return response.json();
  },

  async getMe(): Promise<{ user: User }> {
    const response = await apiRequest("GET", "/api/auth/me");
    return response.json();
  },

  // Email operations
  async getEmails(folder = "inbox"): Promise<Message[]> {
    const response = await apiRequest("GET", `/api/emails?folder=${folder}`);
    return response.json();
  },

  async getEmail(messageId: string): Promise<Message> {
    const response = await apiRequest("GET", `/api/emails/${messageId}`);
    return response.json();
  },

  async sendEmail(emailData: SendEmailRequest) {
    const response = await apiRequest("POST", "/api/emails/send", emailData);
    return response.json();
  },

  async decryptEmail(messageId: string) {
    const response = await apiRequest("POST", `/api/emails/${messageId}/decrypt`);
    return response.json();
  },

  async fetchEmails() {
    const response = await apiRequest("POST", "/api/emails/fetch");
    return response.json();
  },

  // Key management
  async getKeyPool(): Promise<KeyPoolStats> {
    const response = await apiRequest("GET", "/api/keys/pool");
    return response.json();
  },

  async getKeys(): Promise<QuantumKey[]> {
    const response = await apiRequest("GET", "/api/keys");
    return response.json();
  },

  async requestKey(keyLength = 8192, recipient?: string) {
    const response = await apiRequest("POST", "/api/keys/request", { keyLength, recipient });
    return response.json();
  },

  // Audit logs
  async getAuditLogs(limit = 50): Promise<AuditLog[]> {
    const response = await apiRequest("GET", `/api/audit?limit=${limit}`);
    return response.json();
  },

  // User settings
  async updateSettings(settings: Record<string, any>) {
    const response = await apiRequest("PUT", "/api/user/settings", settings);
    return response.json();
  }
};