import { DocumentCreateDialog } from "./DocumentCreateDialog";
import { Icon } from "../ui/Icon";
import type { User, Organization } from "../../types";
import { RADIUS } from '../../lib/designSystem';
import { cn } from '../ui/utils';

export interface DocumentDashboardCreateSectionProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    title: string,
    description?: string,
    contributors?: string[],
    options?: object,
    ownershipType?: string,
    organizationId?: string
  ) => void | Promise<void>;
  currentUser: User;
  currentOrganizationId?: string;
  organizations: Organization[];
  experienceLevel?: string;
  trackDocument?: (name: string) => void;
  createLabel: string;
}

export function DocumentDashboardCreateSection({
  isOpen,
  onOpenChange,
  onSubmit,
  currentUser,
  currentOrganizationId,
  organizations,
  experienceLevel,
  trackDocument,
  createLabel,
}: DocumentDashboardCreateSectionProps) {
  return isOpen ? (
    <DocumentCreateDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      currentUser={currentUser}
      currentOrganizationId={currentOrganizationId}
      organizations={organizations}
      experienceLevel={experienceLevel}
      trackDocument={trackDocument}
    />
  ) : (
    <div
      className={cn("w-full h-12 bg-primary text-primary-foreground flex items-center justify-center gap-2 cursor-pointer font-medium hover:bg-primary/90 transition-colors shadow-sm hover:shadow-md", RADIUS.panel)}
      onClick={() => onOpenChange(true)}
    >
      <Icon name="Plus" className="h-4 w-4" />
      {createLabel}
    </div>
  );
}
