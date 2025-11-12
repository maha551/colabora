import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
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
import { Users, UserPlus, Crown, X } from "lucide-react";
import { toast } from "sonner";

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
  minRequired = 3,
  maxAllowed = 10
}: RepresentativeSelectorProps) {
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
      toast.error("Please select a user to add as representative");
      return;
    }

    if (selectedRepresentatives.length >= maxAllowed) {
      toast.error(`Maximum ${maxAllowed} representatives allowed`);
      return;
    }

    if (selectedRepresentatives.includes(selectedUserId)) {
      toast.error("User is already a representative");
      return;
    }

    const newRepresentatives = [...selectedRepresentatives, selectedUserId];
    onRepresentativesChange(newRepresentatives);
    setSelectedUserId("");
    toast.success("Representative added successfully");
  };

  const handleRemoveRepresentative = (userId: string) => {
    const newRepresentatives = selectedRepresentatives.filter(id => id !== userId);
    onRepresentativesChange(newRepresentatives);
    toast.success("Representative removed");
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
        <p className="text-sm text-gray-600 mb-2">
          Select {minRequired} to {maxAllowed} representatives to govern this organization.
          Representatives can manage members, create votes, and make decisions.
        </p>
      </div>

      {/* Current Representatives */}
      <div>
        <Label className="text-sm font-medium">Current Representatives</Label>
        <div className="border rounded-md p-3 min-h-[80px] mt-1">
          {selectedRepresentatives.length === 0 ? (
            <p className="text-gray-500 text-sm flex items-center gap-2">
              <Crown className="h-4 w-4" />
              No representatives selected
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedRepresentatives.map((repId) => {
                const user = getUserById(repId);
                return (
                  <Badge key={repId} variant="secondary" className="flex items-center gap-2 px-3 py-1">
                    <Avatar className="h-4 w-4">
                      <AvatarFallback className="text-xs">
                        {user?.name?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs">{user?.name || 'Unknown'}</span>
                    <button
                      onClick={() => handleRemoveRepresentative(repId)}
                      className="ml-1 text-xs hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">
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
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">
                        {user.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium text-sm">{user.name}</div>
                      <div className="text-xs text-gray-500">{user.email}</div>
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
            <UserPlus className="h-4 w-4" />
            Add
          </Button>
        </div>
      )}

      {availableUsers.length === 0 && (
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <Users className="h-4 w-4" />
          All available users are already representatives
        </p>
      )}
    </div>
  );
}
