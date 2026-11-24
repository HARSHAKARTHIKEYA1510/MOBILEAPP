export const colors = {
  // Brand & interactive accents (Nova: Electric Indigo, Vivid Violet & Neon Accents)
  brand: '#5B4EF5',
  brandGradientEnd: '#7C3AED',
  brandLight: '#6366F1',
  brandMuted: '#EEF2FF',
  brandMutedBorder: '#C7D2FE',
  accent: '#7C3AED',
  accentPressed: '#4338CA',

  // Surfaces & Backgrounds
  bg: '#F8FAFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F4FD',
  surfaceElevated: '#FFFFFF',
  chatBg: '#F3F5FC',

  // Message bubbles
  outgoing: '#5B4EF5',
  outgoingText: '#FFFFFF',
  outgoingSubtext: 'rgba(255, 255, 255, 0.78)',
  incoming: '#FFFFFF',
  incomingBorder: '#E6EBF8',

  // Typography & borders
  text: '#0B0F28',
  subtext: '#556080',
  muted: '#9CA3AF',
  border: '#E2E8F5',
  borderLight: '#EDF2FB',
  divider: '#EEF2F8',

  // Status & Badges
  online: '#10B981',
  onlineBorder: '#FFFFFF',
  tickSent: 'rgba(255, 255, 255, 0.65)',
  tickRead: '#38BDF8',
  badgeBg: '#5B4EF5',
  badgeText: '#FFFFFF',
  error: '#EF4444',
  errorBg: '#FEF2F2',
  errorBorder: '#FEE2E2',
};

/** Time of day, e.g. "14:05". */
export function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** For the chat list: time if today, "Yesterday", otherwise a short date. */
export function formatListTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (d.getTime() >= startOfToday) return formatTime(iso);
  if (d.getTime() >= startOfToday - dayMs) return 'Yesterday';
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

/** Date divider label inside a chat thread, e.g. "Today", "Yesterday", or "Nov 22". */
export function formatDayLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (startOfTarget === startOfToday) return 'Today';
  if (startOfTarget === startOfToday - dayMs) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function isSameDay(aIso: string, bIso: string) {
  const a = new Date(aIso);
  const b = new Date(bIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const AVATAR_COLORS = [
  '#5B4EF5',
  '#06B6D4',
  '#EC4899',
  '#8B5CF6',
  '#10B981',
  '#F59E0B',
  '#3B82F6',
  '#6366F1',
];

export function avatarColor(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
