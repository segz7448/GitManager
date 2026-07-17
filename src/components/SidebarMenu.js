import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Alert,
  Easing,
} from 'react-native';
import { navigate } from '../navigation';
import { useSidebar } from '../context/SidebarContext';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, typography } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(300, SCREEN_WIDTH * 0.8);

const MENU_ITEMS = [
  { key: 'profile', label: 'Profile', icon: '👤' },
  { key: 'terminal', label: 'Terminal', icon: '⌨' },
  { key: 'issues', label: 'Issues', icon: '⊙' },
  { key: 'activity', label: 'Recent Activity', icon: '◷' },
  { key: 'widget', label: 'Home Screen Widget', icon: '▦' },
  { key: 'settings', label: 'Settings', icon: '⚙' },
];

export default function SidebarMenu() {
  const { isOpen, close } = useSidebar();
  const { username, logout } = useAuth();
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -DRAWER_WIDTH,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen]);

  const handleNavigate = (key) => {
    close();
    switch (key) {
      case 'profile':
        navigate('Profile');
        break;
      case 'terminal':
        navigate('MainTabs', { screen: 'Terminal' });
        break;
      case 'issues':
        navigate('Issues');
        break;
      case 'activity':
        navigate('Activity');
        break;
      case 'widget':
        navigate('WidgetSettings');
        break;
      case 'settings':
        navigate('MainTabs', { screen: 'Settings' });
        break;
    }
  };

  const handleLogout = () => {
    close();
    Alert.alert('Disconnect account', 'Remove the stored token from this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <>
      <Animated.View
        pointerEvents={isOpen ? 'auto' : 'none'}
        style={[styles.overlay, { opacity: overlayOpacity }]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      </Animated.View>

      <Animated.View style={[styles.drawer, { transform: [{ translateX }] }]}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(username || '?').charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.username}>{username || 'Not signed in'}</Text>
        </View>

        <View style={styles.menuList}>
          {MENU_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.menuItem}
              onPress={() => handleNavigate(item.key)}
            >
              <Text style={styles.menuIcon}>{item.icon}</Text>
              <Text style={styles.menuLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Disconnect / Logout</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10,
  },
  drawer: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: colors.bgSubtle,
    borderRightColor: colors.border,
    borderRightWidth: 1,
    zIndex: 20,
    paddingTop: 50,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.accentEmphasis,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  username: { color: colors.fgDefault, fontSize: typography.sizeLg, fontWeight: '600' },
  menuList: { flex: 1, paddingTop: spacing.md },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
  },
  menuIcon: { fontSize: 18, width: 32, color: colors.fgMuted },
  menuLabel: { color: colors.fgDefault, fontSize: typography.sizeMd },
  footer: { padding: spacing.lg, borderTopColor: colors.border, borderTopWidth: 1 },
  logoutButton: { paddingVertical: spacing.sm },
  logoutText: { color: colors.danger, fontWeight: '600' },
});
