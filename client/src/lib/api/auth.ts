// Auth API functions
import { apiRequest } from './client';
import type { LoginResponse, RegisterResponse, CurrentUserResponse, MessageResponse } from './types';
import type { MemberProfileResponse, User } from '../../types';
import type { UpdateProfilePayload } from './types/auth';

// Helper function to make unauthenticated requests (for login/register)
async function unapiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Use apiRequest with skipAuth=true to avoid authentication
  // This consolidates duplicate code while maintaining the same API
  return apiRequest<T>(endpoint, options, 2, true) // skipAuth = true
}

export const authApi = {
  // Login
  async login(email: string, password: string): Promise<LoginResponse> {
    return unapiRequest<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  },

  // Register
  async register(
    name: string,
    email: string,
    password: string,
    options?: {
      invitationToken?: string;
      acceptedTerms?: boolean;
      termsVersion?: string;
      privacyVersion?: string;
    }
  ): Promise<RegisterResponse> {
    return unapiRequest<RegisterResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name,
        email,
        password,
        invitationToken: options?.invitationToken,
        acceptedTerms: options?.acceptedTerms,
        termsVersion: options?.termsVersion,
        privacyVersion: options?.privacyVersion,
      }),
    })
  },

  // Validate invitation token
  async validateInvitationToken(token: string): Promise<{
    valid: boolean;
    userExists?: boolean; // Indicates if user with this email already has an account
    invitation?: {
      id: string;
      organizationId: string;
      organizationName: string;
      email: string;
      invitationType: 'member' | 'representative';
      inviterName: string;
      expiresAt: string;
      createdAt: string;
    };
    error?: string;
    expired?: boolean;
    status?: string;
  }> {
    return apiRequest(`/api/organizations/invitations/validate/${token}`)
  },

  // Accept invitation (for logged-in users)
  async acceptInvitation(token: string): Promise<{
    success: boolean;
    message: string;
    organization?: {
      id: string;
      name: string;
    };
    invitationType?: 'member' | 'representative';
    alreadyMember?: boolean;
  }> {
    return apiRequest(`/api/organizations/invitations/${token}/accept`, {
      method: 'POST',
    })
  },

  // Get pending invitations for current user
  async getPendingInvitations(): Promise<{
    invitations: Array<{
      id: string;
      organizationId: string;
      organizationName: string;
      email: string;
      invitationType: 'member' | 'representative';
      inviterName: string;
      expiresAt: string;
      createdAt: string;
    }>;
    count: number;
  }> {
    return apiRequest('/api/organizations/invitations/pending')
  },

  // Decline invitation by token (logged-in users)
  async declineInvitation(token: string): Promise<{ message: string }> {
    return apiRequest(`/api/organizations/invitations/${encodeURIComponent(token)}/decline`, {
      method: 'POST',
    })
  },

  // Accept invitation by id (for pending list)
  async acceptInvitationById(invitationId: string): Promise<{
    success: boolean;
    message: string;
    organization?: { id: string; name: string };
    invitationType?: 'member' | 'representative';
    alreadyMember?: boolean;
  }> {
    return apiRequest('/api/organizations/invitations/accept-by-id', {
      method: 'POST',
      body: JSON.stringify({ invitationId }),
    })
  },

  // Decline invitation by id (for pending list)
  async declineInvitationById(invitationId: string): Promise<{ message: string }> {
    return apiRequest('/api/organizations/invitations/decline-by-id', {
      method: 'POST',
      body: JSON.stringify({ invitationId }),
    })
  },

  // Get current user
  async getCurrentUser(): Promise<CurrentUserResponse> {
    return apiRequest<CurrentUserResponse>('/api/auth/me')
  },

  // Get user profile by ID (for viewing other members' profiles)
  async getUserProfile(userId: string, organizationId?: string): Promise<MemberProfileResponse> {
    const query = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
    return apiRequest<MemberProfileResponse>(`/api/auth/users/${userId}${query}`)
  },

  async updateProfile(payload: UpdateProfilePayload): Promise<{ user: User; message: string }> {
    return apiRequest<{ user: User; message: string }>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  // Logout
  async logout(): Promise<MessageResponse> {
    return apiRequest<MessageResponse>('/api/auth/logout', {
      method: 'POST',
    })
  },

  // Change password (authenticated)
  async changePassword(currentPassword: string, newPassword: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>('/api/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword: newPassword }),
    })
  },

  // Request password reset
  async forgotPassword(email: string): Promise<MessageResponse> {
    return unapiRequest<MessageResponse>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  },

  // Reset password with token
  async resetPassword(token: string, newPassword: string): Promise<MessageResponse> {
    return unapiRequest<MessageResponse>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword, confirmPassword: newPassword }),
    })
  },
}

