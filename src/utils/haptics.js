import * as Haptics from 'expo-haptics';

// Every haptic call in the app goes through here so behavior is consistent
// and can be silenced in one place (e.g. a future "reduce motion" setting).
let enabled = true;

export function setHapticsEnabled(value) {
  enabled = value;
}

export const haptic = {
  tap() {
    if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  select() {
    if (enabled) Haptics.selectionAsync();
  },
  success() {
    if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  warning() {
    if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  },
  error() {
    if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },
};
