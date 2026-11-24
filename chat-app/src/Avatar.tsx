import { StyleSheet, Text, View } from 'react-native';
import { avatarColor, colors } from './theme';

export function Avatar({
  name,
  size = 46,
  showOnline = false,
}: {
  name: string;
  size?: number;
  showOnline?: boolean;
}) {
  const label = name.trim();
  const parts = label.split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : (label[0] ?? '?').toUpperCase();

  const bg = avatarColor(label || '?');
  const dotSize = Math.max(10, Math.round(size * 0.26));

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      <View
        style={[
          styles.root,
          {
            width: size,
            height: size,
            borderRadius: Math.round(size * 0.42),
            backgroundColor: bg,
          },
        ]}>
        <Text style={[styles.text, { fontSize: Math.round(size * 0.36) }]}>{initials}</Text>
      </View>
      {showOnline && (
        <View
          style={[
            styles.onlineBadge,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              bottom: 0,
              right: 0,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#0B0F28',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  onlineBadge: {
    position: 'absolute',
    backgroundColor: colors.online,
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
