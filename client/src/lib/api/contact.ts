import { apiRequest } from './client';

export interface ContactSubmission {
  name: string;
  email: string;
  subject: string;
  message: string;
  website?: string;
}

export interface ContactResponse {
  message: string;
}

export const contactApi = {
  submit(payload: ContactSubmission): Promise<ContactResponse> {
    return apiRequest<ContactResponse>('/api/public/contact', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, 2, true);
  },
};
