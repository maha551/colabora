import type { User } from '../../types';
import { MemberProfileView } from '../MemberProfileView';

interface ProfilePreviewCardProps {
  user: User;
}

export function ProfilePreviewCard({ user }: ProfilePreviewCardProps) {
  return <MemberProfileView user={user} isPreview />;
}
