import { useState, useEffect } from "react";
import { Document, User } from "../types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Users, UserPlus, Crown, Trash2, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { documentsApi } from "../lib/api";

interface CollaboratorManagementProps {
  document: Document;
  currentUser: User;
  onCollaboratorAdded?: (user: User) => void;
  onCollaboratorRemoved?: (userId: string) => void;
  children: React.ReactNode; // The trigger button
}

export function CollaboratorManagement({
  document,
  currentUser,
  onCollaboratorAdded,
  onCollaboratorRemoved,
  children
}: CollaboratorManagementProps) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);

  // Get available demo users (excluding current user and existing collaborators)
  const getAvailableUsers = () => {
    const demoUsers = [
      { id: 'cmgxlfj9z0000orjgnfy3revt', name: 'Alice Johnson', email: 'alice@example.com' },
      { id: 'cmgxlfj9z0000orjgnfy3revu', name: 'Bob Smith', email: 'bob@example.com' },
      { id: 'cmgxlfj9z0000orjgnfy3revv', name: 'Charlie Brown', email: 'charlie@example.com' },
      { id: 'cmgxlfj9z0000orjgnfy3revw', name: 'Diana Prince', email: 'diana@example.com' }
    ];

    const existingUserIds = [
      document.owner.id,
      ...document.collaborators.map(c => c.user.id)
    ];

    return demoUsers.filter(user => !existingUserIds.includes(user.id));
  };

  const availableUsers = getAvailableUsers();
  const isOwner = document.owner.id === currentUser.id;

  const handleInviteCollaborator = async () => {
    if (!inviteEmail.trim()) {
      toast.error("Please enter an email address");
      return;
    }

    // For demo purposes, find user by email
    const userToInvite = availableUsers.find(u => u.email === inviteEmail.trim());
    if (!userToInvite) {
      toast.error("User not found or already a collaborator");
      return;
    }

    setIsInviting(true);
    try {
      console.log('Adding collaborator:', userToInvite.id, 'to document:', document.id);
      await documentsApi.addCollaborator(document.id, userToInvite.id);
      toast.success(`Added ${userToInvite.name} as a collaborator`);
      setInviteEmail("");
      console.log('Collaborator added successfully, calling onCollaboratorAdded callback');

      // Call the callback if provided
      if (onCollaboratorAdded) {
        onCollaboratorAdded(userToInvite);
      }
    } catch (error: any) {
      console.error('Failed to add collaborator:', error);
      toast.error(error.message || "Failed to add collaborator");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveCollaborator = async (collaborator: any) => {
    console.log('handleRemoveCollaborator called with collaborator:', collaborator?.user.name);

    // Use browser confirm dialog instead of AlertDialog for reliability
    const confirmed = window.confirm(`Are you sure you want to remove ${collaborator.user.name} from this document? They will no longer be able to view or edit the document.`);

    if (!confirmed) {
      console.log('User cancelled collaborator removal');
      return;
    }

    try {
      console.log('Removing collaborator:', collaborator.user.id, 'from document:', document.id);
      await documentsApi.removeCollaborator(document.id, collaborator.user.id);
      toast.success(`Removed ${collaborator.user.name} from the document`);
      console.log('Collaborator removed successfully, calling onCollaboratorRemoved callback');

      // Call the callback if provided
      if (onCollaboratorRemoved) {
        onCollaboratorRemoved(collaborator.user.id);
      }
    } catch (error: any) {
      console.error('Failed to remove collaborator:', error);
      toast.error(error.message || "Failed to remove collaborator");
    }
  };

  const CollaboratorItem = ({ collaborator, isOwner: collabIsOwner, canRemove }: {
    collaborator: any;
    isOwner: boolean;
    canRemove: boolean;
  }) => (
    <div className="flex items-center justify-between p-2 border border-gray-200 rounded-md">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Avatar className="h-6 w-6 flex-shrink-0">
          <AvatarFallback className="text-xs">
            {collaborator.user.name.split(' ').map((n: string) => n[0]).join('')}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="font-medium text-sm truncate">{collaborator.user.name}</span>
            {isOwner && (
              <Badge variant="default" className="bg-yellow-500 text-xs px-1 py-0 h-4">
                <Crown className="h-2 w-2 mr-1" />
                Owner
              </Badge>
            )}
            {collabIsOwner && (
              <Badge variant="secondary" className="text-xs px-1 py-0 h-4">
                <Users className="h-2 w-2 mr-1" />
                Collab
              </Badge>
            )}
          </div>
          <p className="text-xs text-gray-600 truncate">{collaborator.user.email}</p>
        </div>
      </div>

      {canRemove && (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation(); // Prevent dropdown from closing
            console.log('Trash button clicked for collaborator:', collaborator.user.name);
            handleRemoveCollaborator(collaborator);
          }}
          className="text-red-600 hover:text-red-700 hover:bg-red-50 h-6 w-6 p-0 flex-shrink-0"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {children}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 p-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b">
              <Users className="h-4 w-4" />
              <span className="font-medium text-sm">Manage Collaborators</span>
            </div>

            {/* Current Collaborators */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm text-gray-900">
                Current Collaborators ({document.collaborators.length + 1})
              </h4>

              {/* Owner */}
              <CollaboratorItem
                collaborator={{
                  user: document.owner,
                  createdAt: document.createdAt
                }}
                isOwner={true}
                canRemove={false}
              />

              {/* Collaborators */}
              {document.collaborators.map((collaborator) => (
                <CollaboratorItem
                  key={collaborator.id}
                  collaborator={collaborator}
                  isOwner={false}
                  canRemove={isOwner} // Only owner can remove collaborators
                />
              ))}
            </div>

            {/* Invite New Collaborator */}
            {isOwner && availableUsers.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-gray-900 flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Invite Collaborator
                </h4>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="invite-email">Email Address</Label>
                    <div className="flex gap-2">
                      <Input
                        id="invite-email"
                        type="email"
                        placeholder="Enter email address"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleInviteCollaborator()}
                        className="h-8"
                      />
                      <Button
                        onClick={handleInviteCollaborator}
                        disabled={isInviting || !inviteEmail.trim()}
                        size="sm"
                      >
                        {isInviting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                        {isInviting ? "Adding..." : "Invite"}
                      </Button>
                    </div>
                  </div>

                  {/* Quick invite for demo users */}
                  <div className="space-y-2">
                    <Label className="text-sm text-gray-600">Quick Invite (Demo Users)</Label>
                    <div className="grid grid-cols-1 gap-1">
                      {availableUsers.slice(0, 4).map((user) => (
                        <Button
                          key={user.id}
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setInviteEmail(user.email);
                            setTimeout(() => handleInviteCollaborator(), 100);
                          }}
                          disabled={isInviting}
                          className="justify-start text-xs h-7"
                        >
                          <Mail className="h-3 w-3 mr-2" />
                          {user.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!isOwner && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  Only the document owner can manage collaborators.
                </p>
              </div>
            )}

            {isOwner && availableUsers.length === 0 && (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-600">
                  All available demo users are already collaborators on this document.
                </p>
              </div>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

    </>
  );
}
