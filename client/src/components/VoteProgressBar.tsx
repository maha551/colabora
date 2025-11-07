// No React import needed with jsx transform
import { cn } from "./ui/utils";

interface VoteProgressBarProps {
  totalUsers: number;
  proVotes: number;
  neutralVotes: number;
  contraVotes: number;
  className?: string;
  showTooltips?: boolean;
}

export function VoteProgressBar({
  totalUsers,
  proVotes,
  neutralVotes,
  contraVotes,
  className,
  showTooltips = true,
}: VoteProgressBarProps) {
  const totalVotes = proVotes + neutralVotes + contraVotes;
  const notVotedCount = Math.max(0, totalUsers - totalVotes);

  // Calculate percentages based on total users
  const proPercentage = totalUsers > 0 ? (proVotes / totalUsers) * 100 : 0;
  const neutralPercentage = totalUsers > 0 ? (neutralVotes / totalUsers) * 100 : 0;
  const contraPercentage = totalUsers > 0 ? (contraVotes / totalUsers) * 100 : 0;
  const notVotedPercentage = totalUsers > 0 ? (notVotedCount / totalUsers) * 100 : 0;

  return (
    <div
      className={cn(
        "flex w-full overflow-hidden bg-gray-200",
        className
      )}
      style={{ minHeight: '12px' }}
    >
      {/* Not voted (gray) */}
      {notVotedPercentage > 0 && (
        <div
          className="transition-all duration-300"
          style={{
            width: `${notVotedPercentage}%`,
            backgroundColor: '#d1d5db',
            flex: `0 0 ${notVotedPercentage}%`,
          }}
          title={showTooltips ? `Not voted: ${notVotedCount}` : undefined}
        />
      )}
      {/* Reject votes (red) */}
      {contraPercentage > 0 && (
        <div
          className="transition-all duration-300"
          style={{
            width: `${contraPercentage}%`,
            backgroundColor: '#ef4444',
            flex: `0 0 ${contraPercentage}%`,
          }}
          title={showTooltips ? `Reject: ${contraVotes}` : undefined}
        />
      )}
      {/* Neutral votes (blue) */}
      {neutralPercentage > 0 && (
        <div
          className="transition-all duration-300"
          style={{
            width: `${neutralPercentage}%`,
            backgroundColor: '#3b82f6',
            flex: `0 0 ${neutralPercentage}%`,
          }}
          title={showTooltips ? `Neutral: ${neutralVotes}` : undefined}
        />
      )}
      {/* Approve votes (green) */}
      {proPercentage > 0 && (
        <div
          className="transition-all duration-300"
          style={{
            width: `${proPercentage}%`,
            backgroundColor: '#22c55e',
            flex: `0 0 ${proPercentage}%`,
          }}
          title={showTooltips ? `Approve: ${proVotes}` : undefined}
        />
      )}
    </div>
  );
}

