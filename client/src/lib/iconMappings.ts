/**
 * Icon Name Mappings
 * 
 * Maps Lucide icon names to equivalent names in Tabler and Heroicons.
 * Handles cases where icons have different names or don't exist in all libraries.
 */

export interface IconMapping {
  lucide: string;
  tabler: string | null; // null if icon doesn't exist in Tabler
  heroicons: string | null; // null if icon doesn't exist in Heroicons
}

/**
 * Icon name mappings for common icons
 * Format: Lucide name -> { tabler: TablerName, heroicons: HeroiconsName }
 */
export const iconMappings: Record<string, { tabler?: string; heroicons?: string }> = {
  // Common navigation icons
  Menu: { tabler: 'IconMenu2', heroicons: 'Bars3Icon' },
  X: { tabler: 'IconX', heroicons: 'XMarkIcon' },
  ChevronLeft: { tabler: 'IconChevronLeft', heroicons: 'ChevronLeftIcon' },
  ChevronRight: { tabler: 'IconChevronRight', heroicons: 'ChevronRightIcon' },
  ChevronDown: { tabler: 'IconChevronDown', heroicons: 'ChevronDownIcon' },
  ChevronUp: { tabler: 'IconChevronUp', heroicons: 'ChevronUpIcon' },
  ArrowLeft: { tabler: 'IconArrowLeft', heroicons: 'ArrowLeftIcon' },
  ArrowRight: { tabler: 'IconArrowRight', heroicons: 'ArrowRightIcon' },
  ArrowUp: { tabler: 'IconArrowUp', heroicons: 'ArrowUpIcon' },
  ArrowDown: { tabler: 'IconArrowDown', heroicons: 'ArrowDownIcon' },
  ChevronsDown: { tabler: 'IconChevronsDown', heroicons: 'ChevronDoubleDownIcon' },
  ChevronsUp: { tabler: 'IconChevronsUp', heroicons: 'ChevronDoubleUpIcon' },
  
  // User and people icons
  User: { tabler: 'IconUser', heroicons: 'UserIcon' },
  Users: { tabler: 'IconUsers', heroicons: 'UsersIcon' },
  UserPlus: { tabler: 'IconUserPlus', heroicons: 'UserPlusIcon' },
  UserMinus: { tabler: 'IconUserMinus', heroicons: 'UserMinusIcon' },
  UserCheck: { tabler: 'IconUserCheck', heroicons: 'UserCheckIcon' },
  UserX: { tabler: 'IconUserX', heroicons: 'UserXIcon' },
  Crown: { tabler: 'IconCrown', heroicons: 'CrownIcon' },
  
  // Document and file icons
  FileText: { tabler: 'IconFileText', heroicons: 'DocumentTextIcon' },
  File: { tabler: 'IconFile', heroicons: 'DocumentIcon' },
  Folder: { tabler: 'IconFolder', heroicons: 'FolderIcon' },
  Edit: { tabler: 'IconEdit', heroicons: 'PencilIcon' },
  Edit3: { tabler: 'IconEdit', heroicons: 'PencilIcon' },
  Plus: { tabler: 'IconPlus', heroicons: 'PlusIcon' },
  PlusCircle: { tabler: 'IconCirclePlus', heroicons: 'PlusCircleIcon' },
  Download: { tabler: 'IconDownload', heroicons: 'ArrowDownTrayIcon' },
  Trash2: { tabler: 'IconTrash', heroicons: 'TrashIcon' },
  History: { tabler: 'IconHistory', heroicons: 'ClockIcon' }, // Heroicons has no distinct "history" icon; ClockIcon is the closest
  Clock: { tabler: 'IconClock', heroicons: 'ClockIcon' },     // same Heroicons mapping as History — no better match exists
  Calendar: { tabler: 'IconCalendar', heroicons: 'CalendarIcon' },
  
  // Communication icons
  MessageSquare: { tabler: 'IconMessageCircle', heroicons: 'ChatBubbleLeftRightIcon' },
  Mail: { tabler: 'IconMail', heroicons: 'EnvelopeIcon' },
  Send: { tabler: 'IconSend', heroicons: 'PaperAirplaneIcon' },
  Copy: { tabler: 'IconCopy', heroicons: 'ClipboardDocumentIcon' },
  ExternalLink: { tabler: 'IconExternalLink', heroicons: 'ArrowTopRightOnSquareIcon' },
  
  // Status and feedback icons
  Bug: { tabler: 'IconBug', heroicons: 'BugAntIcon' },
  Check: { tabler: 'IconCheck', heroicons: 'CheckIcon' },
  CheckCircle: { tabler: 'IconCircleCheck', heroicons: 'CheckCircleIcon' },
  XCircle: { tabler: 'IconCircleX', heroicons: 'XCircleIcon' },
  AlertTriangle: { tabler: 'IconAlertTriangle', heroicons: 'ExclamationTriangleIcon' },
  Hourglass: { tabler: 'IconHourglass' }, // Heroicons doesn't have exact match
  Loader2: { tabler: 'IconLoader2', heroicons: 'ArrowPathIcon' },   // Heroicons has no distinct spinner; ArrowPathIcon is closest
  RefreshCw: { tabler: 'IconRefresh', heroicons: 'ArrowPathIcon' }, // same Heroicons mapping as Loader2 — no better match exists
  
  // Organization and structure icons
  Building2: { tabler: 'IconBuilding', heroicons: 'BuildingOfficeIcon' },
  Network: { tabler: 'IconNetwork', heroicons: 'ShareIcon' },
  LayoutDashboard: { tabler: 'IconLayoutDashboard', heroicons: 'Squares2X2Icon' },
  Archive: { tabler: 'IconArchive', heroicons: 'ArchiveBoxIcon' },
  Eye: { tabler: 'IconEye', heroicons: 'EyeIcon' },
  EyeOff: { tabler: 'IconEyeOff', heroicons: 'EyeSlashIcon' },
  Lock: { tabler: 'IconLock', heroicons: 'LockClosedIcon' },
  Shield: { tabler: 'IconShield', heroicons: 'ShieldCheckIcon' },
  TrendingUp: { tabler: 'IconTrendingUp', heroicons: 'ArrowTrendingUpIcon' },
  BarChart3: { tabler: 'IconChartBar', heroicons: 'ChartBarIcon' },
  Activity: { tabler: 'IconActivity', heroicons: 'SignalIcon' },
  
  // Action and control icons
  Minus: { tabler: 'IconMinus', heroicons: 'MinusIcon' },
  Settings: { tabler: 'IconSettings', heroicons: 'Cog6ToothIcon' },
  HelpCircle: { tabler: 'IconHelpCircle', heroicons: 'QuestionMarkCircleIcon' },
  Info: { tabler: 'IconInfoCircle', heroicons: 'InformationCircleIcon' },
  Expand: { tabler: 'IconMaximize', heroicons: 'ArrowsPointingOutIcon' },
  RotateCcw: { tabler: 'IconRotateCcw', heroicons: 'ArrowUturnLeftIcon' }, // ArrowPathIcon was shared with Loader2/RefreshCw; ArrowUturnLeftIcon is directional undo — distinct
  Play: { tabler: 'IconPlayerPlay', heroicons: 'PlayIcon' },
  
  // Voting and governance icons
  Vote: { tabler: 'IconVote', heroicons: 'HandRaisedIcon' },
  ThumbsUp: { tabler: 'IconThumbUp', heroicons: 'HandThumbUpIcon' },
  ThumbsDown: { tabler: 'IconThumbDown', heroicons: 'HandThumbDownIcon' },
  
  // Search and filter icons
  Search: { tabler: 'IconSearch', heroicons: 'MagnifyingGlassIcon' },
  Filter: { tabler: 'IconFilter', heroicons: 'FunnelIcon' },
  Languages: { tabler: 'IconLanguage', heroicons: 'LanguageIcon' },
  
  // Additional common icons
  Home: { tabler: 'IconHome', heroicons: 'HomeIcon' },
  LogOut: { tabler: 'IconLogout', heroicons: 'ArrowRightOnRectangleIcon' },
  LogIn: { tabler: 'IconLogin', heroicons: 'ArrowLeftOnRectangleIcon' },
  Save: { tabler: 'IconDeviceFloppy', heroicons: 'DocumentArrowDownIcon' },
  Share: { tabler: 'IconShare', heroicons: 'ShareIcon' },
  MoreVertical: { tabler: 'IconDotsVertical', heroicons: 'EllipsisVerticalIcon' },
  MoreHorizontal: { tabler: 'IconDots', heroicons: 'EllipsisHorizontalIcon' },

  // Additional icons used across the app (Phase 1.1)
  AlertCircle: { tabler: 'IconAlertCircle', heroicons: 'ExclamationCircleIcon' },
  CheckCircle2: { tabler: 'IconCircleCheck', heroicons: 'CheckCircleIcon' },
  FileEdit: { tabler: 'IconFileEdit', heroicons: 'PencilSquareIcon' },
  Image: { tabler: 'IconPhoto', heroicons: 'PhotoIcon' },
  Bell: { tabler: 'IconBell', heroicons: 'BellIcon' },
  Camera: { tabler: 'IconCamera', heroicons: 'CameraIcon' },
  Trophy: { tabler: 'IconTrophy', heroicons: 'TrophyIcon' },
  Circle: { tabler: 'IconCircle' }, // no heroicons equivalent ('CircleIcon' does not exist in @heroicons/react/24/outline); falls back to Lucide
  Zap: { tabler: 'IconBolt', heroicons: 'BoltIcon' },
  FileCheck: { tabler: 'IconFileCheck', heroicons: 'DocumentCheckIcon' },
  Lightbulb: { tabler: 'IconBulb', heroicons: 'LightBulbIcon' },
  Target: { tabler: 'IconTarget', heroicons: 'FlagIcon' },
  Sparkles: { tabler: 'IconSparkles', heroicons: 'SparklesIcon' },
  Sun: { tabler: 'IconSun', heroicons: 'SunIcon' },
  Moon: { tabler: 'IconMoon', heroicons: 'MoonIcon' },
  Wifi: { tabler: 'IconWifi', heroicons: 'SignalIcon' },
  WifiOff: { tabler: 'IconWifiOff', heroicons: 'SignalSlashIcon' },
  LayoutGrid: { tabler: 'IconLayoutGrid', heroicons: 'ViewColumnsIcon' },
  ListTree: { tabler: 'IconListTree', heroicons: 'QueueListIcon' },
  PanelLeft: { tabler: 'IconPanelLeft', heroicons: 'Bars3Icon' },
  Pin: { tabler: 'IconPin', heroicons: 'MapPinIcon' },
  PinOff: { tabler: 'IconPinOff' }, // no heroicons equivalent (MapPinIcon is identical to Pin, breaking pinned/unpinned affordance); falls back to Lucide
  Navigation: { tabler: 'IconNavigation', heroicons: 'ArrowUpCircleIcon' }, // MapPinIcon was semantically wrong (location pin ≠ navigation)
  GripVertical: { tabler: 'IconGripVertical', heroicons: 'Bars4Icon' },
  Rocket: { tabler: 'IconRocket', heroicons: 'RocketLaunchIcon' },
  ChevronsUpDown: { tabler: 'IconChevronsUpDown', heroicons: 'ChevronUpDownIcon' },
  ArrowUpDown: { tabler: 'IconArrowUpDown', heroicons: 'ArrowsUpDownIcon' },
  Move: { tabler: 'IconArrowsMove', heroicons: 'ArrowsRightLeftIcon' },
  Merge: { tabler: 'IconMerge', heroicons: 'ArrowsPointingInIcon' },
  ListOrdered: { tabler: 'IconListNumbers', heroicons: 'ListBulletIcon' },
  CheckSquare: { tabler: 'IconSquareCheck', heroicons: 'CheckSquareIcon' },
  FolderTree: { tabler: 'IconFolderTree', heroicons: 'FolderOpenIcon' },
  FolderPlus: { tabler: 'IconFolderPlus', heroicons: 'FolderPlusIcon' },
  Undo2: { tabler: 'IconArrowBackUp', heroicons: 'ArrowUturnLeftIcon' },
  Pencil: { tabler: 'IconPencil', heroicons: 'PencilIcon' },
  CornerDownRight: { tabler: 'IconCornerDownRight', heroicons: 'ArrowTurnDownRightIcon' },
  Palette: { tabler: 'IconPalette', heroicons: 'SwatchIcon' },
  FolderOpen: { tabler: 'IconFolderOpen', heroicons: 'FolderOpenIcon' },
  UserCircle: { tabler: 'IconUserCircle', heroicons: 'UserCircleIcon' },
};

/**
 * Get the icon name for a specific icon set
 * @param lucideName - The Lucide icon name
 * @param iconSet - The target icon set
 * @returns The icon name in the target set, or the original name if no mapping exists
 */
export function getIconNameForSet(lucideName: string, iconSet: 'lucide' | 'tabler' | 'heroicons'): string {
  if (iconSet === 'lucide') {
    return lucideName;
  }
  
  const mapping = iconMappings[lucideName];
  if (!mapping) {
    // No mapping found, return original name (will be handled by iconLoader)
    return lucideName;
  }
  
  if (iconSet === 'tabler' && mapping.tabler) {
    return mapping.tabler;
  }
  
  if (iconSet === 'heroicons' && mapping.heroicons) {
    return mapping.heroicons;
  }
  
  // Mapping exists but icon not available in target set, return original
  return lucideName;
}

/**
 * Check if an icon exists in a specific icon set
 * @param lucideName - The Lucide icon name
 * @param iconSet - The target icon set
 * @returns true if icon exists (or mapping exists), false otherwise
 */
export function iconExistsInSet(lucideName: string, iconSet: 'lucide' | 'tabler' | 'heroicons'): boolean {
  if (iconSet === 'lucide') {
    return true; // Assume all Lucide icons exist
  }
  
  const mapping = iconMappings[lucideName];
  if (!mapping) {
    // No mapping, but iconLoader will try to find it
    return true;
  }
  
  if (iconSet === 'tabler') {
    return mapping.tabler !== null && mapping.tabler !== undefined;
  }
  
  if (iconSet === 'heroicons') {
    return mapping.heroicons !== null && mapping.heroicons !== undefined;
  }
  
  return false;
}

