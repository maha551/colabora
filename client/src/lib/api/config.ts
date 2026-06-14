import { apiRequest } from './client';

export interface PublicConfigResponse {
  videoRoomCreationEnabled: boolean;
  operatorName?: string;
  operatorAddress?: string;
  contactEmail?: string;
  termsVersion?: string;
  privacyVersion?: string;
}

export const configApi = {
  getPublicConfig(): Promise<PublicConfigResponse> {
    return apiRequest<PublicConfigResponse>('/api/config/public');
  },
};
