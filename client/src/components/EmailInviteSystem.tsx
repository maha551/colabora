import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Mail, Users, Send, CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import { Organization, User } from '../types';
import { organizationsApi } from '../lib/api';

interface EmailInviteSystemProps {
  organization: Organization;
  currentUser: User;
  onUpdate: () => void;
}

export function EmailInviteSystem({ organization, currentUser, onUpdate }: EmailInviteSystemProps) {
  const [emails, setEmails] = useState('');
  const [inviting, setInviting] = useState(false);
  const [lastInvitation, setLastInvitation] = useState<{
    count: number;
    timestamp: Date;
  } | null>(null);

  const isRepresentative = organization.representatives?.includes(currentUser.id);

  const handleSendInvites = async () => {
    if (!emails.trim()) {
      toast.error('Please enter email addresses');
      return;
    }

    // Parse and validate emails
    const emailList = emails
      .split(/[\n,;]/)
      .map(email => email.trim())
      .filter(email => email.length > 0);

    if (emailList.length === 0) {
      toast.error('Please enter valid email addresses');
      return;
    }

    // Basic email validation
    const invalidEmails = emailList.filter(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    if (invalidEmails.length > 0) {
      toast.error(`Invalid email addresses: ${invalidEmails.join(', ')}`);
      return;
    }

    try {
      setInviting(true);
      await organizationsApi.inviteMembers(organization.id, emailList);

      toast.success(`Invitations sent to ${emailList.length} email addresses`);
      setEmails('');
      setLastInvitation({
        count: emailList.length,
        timestamp: new Date()
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to send invitations:', error);
      toast.error('Failed to send invitations');
    } finally {
      setInviting(false);
    }
  };

  const emailPreview = emails
    .split(/[\n,;]/)
    .map(email => email.trim())
    .filter(email => email.length > 0);

  if (!isRepresentative) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Only representatives can send member invitations.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Member Invitations
          </CardTitle>
          <CardDescription>
            Invite new members to join your organization via email
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="emails">Email Addresses</Label>
            <Textarea
              id="emails"
              placeholder={`Enter email addresses, one per line or separated by commas:

john@example.com
jane@example.com, bob@example.com`}
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              rows={6}
              className="mt-1"
            />
            <p className="text-sm text-gray-500 mt-1">
              Enter multiple emails separated by new lines, commas, or semicolons
            </p>
          </div>

          {emailPreview.length > 0 && (
            <div>
              <Label>Preview ({emailPreview.length} emails)</Label>
              <div className="mt-2 p-3 bg-gray-50 rounded border max-h-32 overflow-y-auto">
                <div className="flex flex-wrap gap-1">
                  {emailPreview.map((email, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {email}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          <Alert>
            <Mail className="h-4 w-4" />
            <AlertDescription>
              <strong>Note:</strong> In the current implementation, invitations are logged but emails are not actually sent.
              In production, this would integrate with an email service like SendGrid or AWS SES.
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            <Button
              onClick={handleSendInvites}
              disabled={!emails.trim() || inviting}
              className="flex-1 gap-2"
            >
              {inviting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Sending Invitations...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Invitations ({emailPreview.length})
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Invitation History */}
      {lastInvitation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Last Invitation Sent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {lastInvitation.count} invitations sent
              </span>
              <span className="flex items-center gap-1">
                <Mail className="h-4 w-4" />
                {lastInvitation.timestamp.toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Membership Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Membership Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded">
              <div className="text-2xl font-bold text-blue-600">
                {organization.members?.filter(m => m.status === 'active').length || 0}
              </div>
              <div className="text-sm text-gray-600">Active Members</div>
            </div>

            <div className="text-center p-4 bg-yellow-50 rounded">
              <div className="text-2xl font-bold text-yellow-600">
                {organization.members?.filter(m => m.status === 'legacy').length || 0}
              </div>
              <div className="text-sm text-gray-600">Legacy Members</div>
            </div>

            <div className="text-center p-4 bg-green-50 rounded">
              <div className="text-2xl font-bold text-green-600">
                {organization.representatives?.length || 0}
              </div>
              <div className="text-sm text-gray-600">Representatives</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
