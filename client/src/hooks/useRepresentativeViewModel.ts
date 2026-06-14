import { useMemo } from 'react';

import { Organization, OrganizationMember, User } from '../types';
import { PendingResignation } from './useRepresentativeManagerActions';

interface UseRepresentativeViewModelParams {
  organization: Organization;
  currentUser: User;
  pendingResignations: PendingResignation[];
}

export function useRepresentativeViewModel({
  organization,
  currentUser,
  pendingResignations,
}: UseRepresentativeViewModelParams) {
  const representatives = organization.representatives || [];

  const isRepresentative = useMemo(
    () => representatives.includes(currentUser.id),
    [representatives, currentUser.id]
  );

  const currentRepCount = representatives.length;

  const availableMembers = useMemo(() => {
    const activeMembers = organization.members?.filter(member => member.status === 'active') || [];
    return activeMembers.filter(member => !representatives.includes(member.userId));
  }, [organization.members, representatives]);

  const getRepresentativeMember = (repId: string): OrganizationMember | undefined => {
    return organization.members?.find(member => member.userId === repId);
  };

  const getPendingResignation = (repId: string): PendingResignation | undefined => {
    return pendingResignations.find(resignation => resignation.userId === repId);
  };

  return {
    representatives,
    isRepresentative,
    currentRepCount,
    availableMembers,
    getRepresentativeMember,
    getPendingResignation,
  };
}
