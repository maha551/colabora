import React from 'react';
import { User } from '../types';
import { UserProfile } from '../components/UserProfile';

interface ProfilePageProps {
  user: User;
  onProfileUpdate: (updatedUser: User) => void;
}

export function ProfilePage({ user, onProfileUpdate }: ProfilePageProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <UserProfile
          user={user}
          onProfileUpdate={onProfileUpdate}
          isModal={false}
        />
      </div>
    </div>
  );
}
