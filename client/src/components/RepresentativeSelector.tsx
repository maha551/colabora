import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Icon } from "./ui/Icon";
import { toast } from "sonner";
import { getUserColor } from "../lib/userColors";
import { RADIUS } from '../lib/designSystem';
import { cn } from './ui/utils';

interface User {
  id: string;
  name: string;
  email: string;
}

interface RepresentativeSelectorProps {
  selectedRepresentatives: string[];
  onRepresentativesChange: (representatives: string[]) => void;
  minRequired?: number;
  maxAllowed?: number;
}

export function RepresentativeSelector({
  selectedRepresentatives,
  onRepresentativesChange,
  minRequired = 1,
  maxAllowed = 10
}: RepresentativeSelectorProps) {
  const { t } = useTranslation('documents');
  const [selectedUserId, setSelectedUserId] = useState("");

  // Get available demo users
  const getAvailableUsers = () => {
    const demoUsers: User[] = [
      { id: 'cmgxlfj9z0000orjgnfy3revt', name: 'Alice Johnson', email: 'alice@example.com' },
      { id: 'cmgxlfj9z0000orjgnfy3revu', name: 'Bob Smith', email: 'bob@example.com' },
      { id: 'cmgxlfj9z0000orjgnfy3revv', name: 'Charlie Brown', email: 'charlie@example.com' },
      { id: 'cmgxlfj9z0000orjgnfy3revw', name: 'Diana Prince', email: 'diana@example.com' }
    ];

    // Filter out already selected representatives
    return demoUsers.filter(user => !selectedRepresentatives.includes(user.id));
  };

  const availableUsers = getAvailableUsers();

  const handleAddRepresentative = () => {
    if (!selectedUserId) {
      toast.error(t('selectUserToAdd'));
      return;
    }

    if (selectedRepresentatives.length >= maxAllowed) {
      toast.error(t('maxRepresentatives', { max: maxAllowed }));
      return;
    }

    if (selectedRepresentatives.includes(selectedUserId)) {
      toast.error(t('userAlreadyRepresentative'));
      return;
    }

    const newRepresentatives = [...selectedRepresentatives, selectedUserId];
    onRepresentativesChange(newRepresentatives);
    setSelectedUserId("");
    toast.success(t('representativeAdded'));
  };

  const handleRemoveRepresentative = (userId: string) => {
    const newRepresentatives = selectedRepresentatives.filter(id => id !== userId);
    onRepresentativesChange(newRepresentatives);
    toast.success(t('representativeRemoved'));
  };

  const getUserById = (userId: string): User | undefined => {
    const demoUsers: User[] = [
      { id: 'cmgxlfj9z0000orjgnfy3revt', name: 'Alice Johnson', email: 'alice@example.com' },
      { id: 'cmgxlfj9z0000orjgnfy3revu', name: 'Bob Smith', email: 'bob@example.com' },
      { id: 'cmgxlfj9z0000orjgnfy3revv', name: 'Charlie Brown', email: 'charlie@example.com' },
      { id: 'cmgxlfj9z0000orjgnfy3revw', name: 'Diana Prince', email: 'diana@example.com' }
    ];
    return demoUsers.find(user => user.id === userId);
  };

  const isValidSelection = selectedRepresentatives.length >= minRequired &&
                          selectedRepresentatives.length <= maxAllowed;

  return (
    <div className="space-y-4">
      <div>
        <Label>Organization Representatives *</Label>
        <p className="text-sm text-muted-foreground mb-2">
          Select {minRequired} to {maxAllowed} representatives to govern this organization.
          Representatives can manage members, create votes, and make decisions.
        </p>
      </div>

      {/* Current Representatives */}
      <div>
        <Label className="text-sm font-medium">Current Representatives</Label>
        <div className={cn("border p-3 min-h-[80px] mt-1", RADIUS.control)}>
          {selectedRepresentatives.length === 0 ? (
            <p className="text-muted-foreground text-sm flex items-center gap-2">
              <Icon name="Crown" className="h-4 w-4" />
              No representatives selected
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedRepresentatives.map((repId) => {
                const user = getUserById(repId);
                return (
                  <Badge key={repId} variant="secondary" className="flex items-center gap-2 px-3 py-1">
                    <Avatar className="h-4 w-4 border" style={{ borderColor: getUserColor(repId) }}>
                      <AvatarFallback className="text-xs">
                        {user?.name?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs">{user?.name || 'Unknown'}</span>
                    <button
                      onClick={() => handleRemoveRepresentative(repId)}
                      className="ml-1 text-xs text-muted-foreground hover:text-[var(--status-rejected-text)]"
                    >
                      <Icon name="X" className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {selectedRepresentatives.length} of {maxAllowed} representatives selected
          {selectedRepresentatives.length < minRequired && (
            <span className="text-red-500"> (minimum {minRequired} required)</span>
          )}
        </p>
      </div>

      {/* Add Representative */}
      {availableUsers.length > 0 && selectedRepresentatives.length < maxAllowed && (
        <div className="flex gap-2">
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select a user to add as representative" />
            </SelectTrigger>
            <SelectContent>
              {availableUsers.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6 border" style={{ borderColor: getUserColor(user.id) }}>
                      <AvatarFallback className="text-xs">
                        {user.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium text-sm">{user.name}</div>
                      <div className="text-xs text-muted-foreground">{user.email}</div>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleAddRepresentative}
            disabled={!selectedUserId}
            size="sm"
            className="gap-1"
          >
            <Icon name="UserPlus" className="h-4 w-4" />
            Add
          </Button>
        </div>
      )}

      {availableUsers.length === 0 && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Icon name="Users" className="h-4 w-4" />
          All available users are already representatives
        </p>
      )}
    </div>
  );
}
