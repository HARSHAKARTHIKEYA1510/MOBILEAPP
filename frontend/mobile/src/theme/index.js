import { Dimensions, PixelRatio } from 'react-native';

const dim = Dimensions.get('window');
export const SCREEN_W = dim.width;
export const SCREEN_H = dim.height;
export const isSmallPhone = SCREEN_W < 380;
export const isTablet = SCREEN_W >= 768;
/** Percentage of screen width */
export const wp = (pct) => (SCREEN_W * pct) / 100;
/** Percentage of screen height */
export const hp = (pct) => (SCREEN_H * pct) / 100;
/** Scale a size down on small phones */
export const sp = (size) => (isSmallPhone ? size * 0.88 : size);

export const PALETTE = {
  bgCanvas: '#F8FAFC',
  bgSurface: '#FFFFFF',
  bgSubtle: '#F1F5F9',
  bgHover: '#E2E8F0',
  
  borderSubtle: '#E2E8F0',
  borderStrong: '#CBD5E1',
  borderDark: '#1E293B',

  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',

  primary: '#2563EB',
  primaryHover: '#1D4ED8',
  accent: '#2563EB',
  accentDark: '#1D4ED8',

  messageSentBg: '#2563EB',
  messageSentText: '#FFFFFF',
  messageSentMeta: '#BFDBFE',

  messageReceivedBg: '#FFFFFF',
  messageReceivedText: '#0F172A',
  messageReceivedBorder: '#E2E8F0',
  messageReceivedMeta: '#64748B',

  statusOnline: '#10B981',
  danger: '#EF4444',
};

export const AVATAR_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#6366F1', // Indigo
  '#0EA5E9', // Sky
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#14B8A6', // Teal
  '#F43F5E', // Rose
  '#06B6D4', // Cyan
];

export function getDeterministicColor(str) {
  if (!str) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

export function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatRelative(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

