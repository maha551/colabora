import React from 'react';
import { User } from '../types';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Activity, UserCircle, LogOut, FileText, Users } from 'lucide-react';

interface UserMenuProps {
  currentUser: User;
  onLogout: () => void;
  onShowActivity?: () => void;
  onShowProfile?: () => void;
  onShowDocuments?: () => void;
  onShowOrganizations?: () => void;
}

export function UserMenu({
  currentUser,
  onLogout,
  onShowActivity,
  onShowProfile,
  onShowDocuments,
  onShowOrganizations,
}: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={(currentUser as any).avatar} />
            <AvatarFallback className="bg-blue-600 text-white text-sm">
              {currentUser.name.split(' ').map(n => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm text-gray-700 hidden sm:inline">{currentUser.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={onShowDocuments}>
          <FileText className="h-4 w-4 mr-2" />
          Documents
        </DropdownMenuItem>
        {onShowActivity && (
          <>
            <DropdownMenuItem onClick={onShowActivity}>
              <Activity className="h-4 w-4 mr-2" />
              Activity Feed
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {onShowProfile && (
          <DropdownMenuItem onClick={onShowProfile}>
            <UserCircle className="h-4 w-4 mr-2" />
            Edit Profile
          </DropdownMenuItem>
        )}
        {onShowOrganizations && (
          <DropdownMenuItem onClick={onShowOrganizations}>
            <Users className="h-4 w-4 mr-2" />
            Organizations
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} className="text-red-600">
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
