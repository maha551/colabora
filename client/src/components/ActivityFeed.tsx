import { useEffect, useState } from "react";
import { User } from "../types";
import { Card } from "./ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { 
  CheckCircle2, 
  MessageSquare, 
  FileEdit, 
  ThumbsUp, 
  ThumbsDown, 
  Minus,
  Clock
} from "lucide-react";
import { cn } from "./ui/utils";

interface ActivityItem {
  id: string;
  type: 'proposal_created' | 'proposal_accepted' | 'vote_cast' | 'comment_added' | 'structure_proposal_created' | 'structure_proposal_vote' | 'structure_proposal_approved' | 'structure_proposal_applied';
  userId: string;
  userName: string;
  userAvatar?: string;
  paragraphTitle?: string;
  proposalText?: string;
  voteType?: 'PRO' | 'NEUTRAL' | 'CONTRA';
  commentText?: string;
  timestamp: string;
}

interface ActivityFeedProps {
  documentId: string;
  currentUser: User;
}

export function ActivityFeed({ documentId, currentUser }: ActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();
    // Refresh every 30 seconds
    const interval = setInterval(fetchActivities, 30000);
    return () => clearInterval(interval);
  }, [documentId]);

  const fetchActivities = async () => {
    try {
      const response = await fetch(`/api/documents/${documentId}/activity`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setActivities(data.activities || []);
      }
    } catch (error) {
      console.error('Failed to fetch activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getActivityIcon = (type: ActivityItem['type'], voteType?: string) => {
    switch (type) {
      case 'proposal_created':
        return <FileEdit className="h-4 w-4 text-blue-600" />;
      case 'proposal_accepted':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'vote_cast':
        if (voteType === 'PRO') return <ThumbsUp className="h-4 w-4 text-green-600" />;
        if (voteType === 'CONTRA') return <ThumbsDown className="h-4 w-4 text-red-600" />;
        return <Minus className="h-4 w-4 text-gray-600" />;
      case 'comment_added':
        return <MessageSquare className="h-4 w-4 text-purple-600" />;
      case 'structure_proposal_created':
        return <div className="h-4 w-4 bg-purple-600 rounded text-white text-xs flex items-center justify-center font-bold">🏗️</div>;
      case 'structure_proposal_vote':
        if (voteType === 'PRO') return <ThumbsUp className="h-4 w-4 text-purple-600" />;
        if (voteType === 'CONTRA') return <ThumbsDown className="h-4 w-4 text-red-600" />;
        return <Minus className="h-4 w-4 text-gray-600" />;
      case 'structure_proposal_approved':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'structure_proposal_applied':
        return <div className="h-4 w-4 bg-green-600 rounded text-white text-xs flex items-center justify-center">✓</div>;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getActivityDescription = (activity: ActivityItem): { title: string; detail: string } => {
    switch (activity.type) {
      case 'proposal_created':
        return {
          title: 'suggested a change',
          detail: activity.paragraphTitle
            ? `to "${activity.paragraphTitle}"`
            : 'to paragraph',
        };
      case 'proposal_accepted':
        return {
          title: 'proposal was accepted',
          detail: activity.paragraphTitle
            ? `in "${activity.paragraphTitle}"`
            : 'for paragraph',
        };
      case 'vote_cast':
        const voteText = activity.voteType === 'PRO'
          ? 'approved'
          : activity.voteType === 'CONTRA'
          ? 'rejected'
          : 'voted neutral on';
        return {
          title: `${voteText} a proposal`,
          detail: activity.paragraphTitle
            ? `in "${activity.paragraphTitle}"`
            : '',
        };
      case 'comment_added':
        return {
          title: 'commented',
          detail: activity.commentText?.substring(0, 50) + (activity.commentText && activity.commentText.length > 50 ? '...' : ''),
        };
      case 'structure_proposal_created':
        return {
          title: 'proposed document restructure',
          detail: activity.paragraphTitle || 'Major document changes',
        };
      case 'structure_proposal_vote':
        const structVoteText = activity.voteType === 'PRO'
          ? 'supported'
          : activity.voteType === 'CONTRA'
          ? 'opposed'
          : 'was neutral on';
        return {
          title: `${structVoteText} restructure proposal`,
          detail: activity.paragraphTitle || 'Document restructuring',
        };
      case 'structure_proposal_approved':
        return {
          title: 'restructure proposal approved',
          detail: activity.paragraphTitle || 'Ready for application',
        };
      case 'structure_proposal_applied':
        return {
          title: 'applied document restructure',
          detail: activity.paragraphTitle || 'Document structure updated',
        };
      default:
        return { title: 'activity', detail: '' };
    }
  };

  const getBadgeColor = (type: ActivityItem['type']) => {
    switch (type) {
      case 'proposal_created':
        return 'bg-blue-100 text-blue-800';
      case 'proposal_accepted':
        return 'bg-green-100 text-green-800';
      case 'vote_cast':
        return 'bg-purple-100 text-purple-800';
      case 'comment_added':
        return 'bg-orange-100 text-orange-800';
      case 'structure_proposal_created':
        return 'bg-purple-100 text-purple-800';
      case 'structure_proposal_vote':
        return 'bg-indigo-100 text-indigo-800';
      case 'structure_proposal_approved':
        return 'bg-green-100 text-green-800';
      case 'structure_proposal_applied':
        return 'bg-emerald-100 text-emerald-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Recent Activity
        </h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex gap-3">
              <div className="h-8 w-8 bg-gray-200 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <Clock className="h-4 w-4" />
        Recent Activity
        {activities.length > 0 && (
          <Badge variant="secondary" className="ml-auto text-xs">
            {activities.length}
          </Badge>
        )}
      </h3>
      
      <ScrollArea className="h-[400px] pr-4">
        {activities.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Clock className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm">No recent activity</p>
            <p className="text-xs mt-1">Start collaborating to see updates</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => {
              const { title, detail } = getActivityDescription(activity);
              const isCurrentUser = activity.userId === currentUser.id;
              
              return (
                <div
                  key={activity.id}
                  className={cn(
                    "flex gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors",
                    isCurrentUser && "bg-blue-50/50"
                  )}
                >
                  <div className="flex-shrink-0">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={activity.userAvatar} />
                      <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                        {activity.userName.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className="text-sm">
                          <span className="font-medium text-gray-900">
                            {isCurrentUser ? 'You' : activity.userName}
                          </span>
                          {' '}
                          <span className="text-gray-600">{title}</span>
                        </p>
                        {detail && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {detail}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-400">
                            {formatTimestamp(activity.timestamp)}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex-shrink-0">
                        {getActivityIcon(activity.type, activity.voteType)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}

