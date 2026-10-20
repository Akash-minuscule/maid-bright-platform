import React, { ComponentProps } from 'react';
import {
  ActivityIndicator,
  ColorValue,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, ui } from '../theme/tokens';
import { useApp } from '../store/AppProvider';
import { useResponsive } from '../hooks/useResponsive';
export type IconName = ComponentProps<typeof Ionicons>['name'];
export function Icon({
  name,
  size = 22,
  color = colors.primary,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
}) {
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
export function Screen({
  children,
  refresh,
  refreshing = false,
  narrow = false,
}: React.PropsWithChildren<{ refresh?: () => void; refreshing?: boolean; narrow?: boolean }>) {
  const { options } = useApp();
  const r = useResponsive();
  return (
    <SafeAreaView edges={['left', 'right']} style={ui.screen}>
      <KeyboardAvoidingView
        style={ui.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={92}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            ui.content,
            { maxWidth: narrow ? 820 : r.maxContentWidth, padding: r.gutter, paddingBottom: 40 },
          ]}
          refreshControl={
            refresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={colors.primary}
              />
            ) : undefined
          }
        >
          {options.offline && (
            <Notice
              tone="warning"
              text="Offline preview · showing the last loaded data. Reconnect in POC controls to make changes."
            />
          )}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Card({ children }: React.PropsWithChildren) {
  return <View style={ui.card}>{children}</View>;
}
export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
  icon?: IconName;
}) {
  const foreground =
    variant === 'primary' ? colors.white : variant === 'danger' ? colors.danger : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary'
          ? styles.primary
          : variant === 'danger'
            ? styles.danger
            : variant === 'secondary'
              ? styles.secondary
              : undefined,
        (disabled || busy) && { opacity: 0.45 },
        pressed && { opacity: 0.75 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={foreground} />
      ) : icon ? (
        <Icon name={icon} size={19} color={foreground} />
      ) : null}
      <Text style={[styles.buttonText, { color: foreground, flexShrink: 1, textAlign: 'center' }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[ui.body, { fontWeight: '600', fontSize: 14 }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[styles.input, props.multiline && { minHeight: 100, textAlignVertical: 'top' }]}
        {...props}
      />
    </View>
  );
}
export function Notice({
  text,
  tone = 'info',
}: {
  text: string;
  tone?: 'info' | 'error' | 'success' | 'warning';
}) {
  const color =
    tone === 'error' ? colors.danger : tone === 'warning' ? colors.amber : colors.primary;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.notice,
        {
          backgroundColor:
            tone === 'error'
              ? colors.dangerLight
              : tone === 'warning'
                ? colors.amberLight
                : colors.mint,
        },
      ]}
    >
      <Icon
        name={
          tone === 'error'
            ? 'alert-circle-outline'
            : tone === 'success'
              ? 'checkmark-circle-outline'
              : 'information-circle-outline'
        }
        size={20}
        color={color}
      />
      <Text style={[ui.caption, { flex: 1, fontSize: 13, lineHeight: 20, color }]}>{text}</Text>
    </View>
  );
}
export function Feedback({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      {error ? <Notice tone="error" text={error} /> : null}
      {success ? <Notice tone="success" text={success} /> : null}
    </>
  );
}
export function Badge({ status }: { status: string }) {
  const danger = ['Cancelled', 'Declined'].includes(status);
  const amber = ['Pending review', 'Due', 'Skipped', 'Requested'].includes(status);
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: danger ? colors.dangerLight : amber ? colors.amberLight : colors.mint },
      ]}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: danger ? colors.danger : amber ? colors.amber : colors.primary,
        }}
      >
        {status}
      </Text>
    </View>
  );
}
export function Empty({
  title,
  body,
  icon = 'leaf-outline',
}: {
  title: string;
  body: string;
  icon?: IconName;
}) {
  return (
    <Card>
      <Icon name={icon} size={36} />
      <Text style={ui.heading}>{title}</Text>
      <Text style={ui.subtitle}>{body}</Text>
    </Card>
  );
}
export function MenuRow({
  title,
  subtitle,
  icon,
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon: IconName;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={styles.menu}
    >
      <View style={styles.iconBox}>
        <Icon name={icon} />
      </View>
      <View style={ui.flex}>
        <Text style={[ui.body, { fontWeight: '600' }]}>{title}</Text>
        {subtitle && <Text style={ui.caption}>{subtitle}</Text>}
      </View>
      <Icon name="chevron-forward" color={colors.muted} size={18} />
    </Pressable>
  );
}
export function SectionTitle({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={ui.between}>
      <Text style={ui.heading}>{title}</Text>
      {action && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={onPress}
          style={{ paddingVertical: 10 }}
        >
          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}
export function Segments({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.segments}>
      {items.map((item) => (
        <Pressable
          key={item}
          accessibilityRole="button"
          accessibilityState={{ selected: item === value }}
          accessibilityLabel={item}
          onPress={() => onChange(item)}
          style={[styles.segment, item === value && { backgroundColor: colors.white }]}
        >
          <Text
            style={{
              color: item === value ? colors.primary : colors.muted,
              fontSize: 13,
              fontWeight: '700',
            }}
          >
            {item}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={[ui.between, { alignItems: 'flex-start' }]}>
      <Text style={[ui.caption, { flex: 1 }]}>{label}</Text>
      <Text style={[ui.body, { fontSize: 14, flex: 1.5, textAlign: 'right', fontWeight: '600' }]}>
        {value}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.mint },
  danger: { backgroundColor: colors.dangerLight },
  buttonText: { fontSize: 14, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    padding: 14,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.white,
    minHeight: 50,
  },
  notice: { padding: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start' },
  menu: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 8, minHeight: 64 },
  iconBox: {
    width: 42,
    height: 42,
    backgroundColor: colors.mintLight,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segments: { backgroundColor: '#EAF0EC', borderRadius: 14, padding: 5, flexDirection: 'row' },
  segment: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
