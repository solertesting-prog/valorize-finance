import { BOOKING_STATUS_LABEL, BookingStatus, KYC_STATUS_LABEL, KycStatus } from '@valorize/shared';
import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { c, f, r, t } from '../theme';

export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  edges = ['top'],
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: ('top' | 'bottom')[];
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ink }} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={s.screen}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.mint} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[s.screen, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

type TxtProps = TextProps & { style?: StyleProp<TextStyle> };
export const H1 = (p: TxtProps) => <Text accessibilityRole="header" {...p} style={[s.h1, p.style]} />;
export const H2 = (p: TxtProps) => <Text accessibilityRole="header" {...p} style={[s.h2, p.style]} />;
export const Body = (p: TxtProps) => <Text {...p} style={[s.body, p.style]} />;
export const Muted = (p: TxtProps) => <Text {...p} style={[s.body, s.muted, p.style]} />;
export const Mono = (p: TxtProps) => <Text {...p} style={[s.mono, p.style]} />;
export const Brand = () => (
  <Text style={s.brand}>
    <Text style={{ color: c.mint }}>VALORIZE</Text> FINANCE
  </Text>
);

export function Button({
  title,
  onPress,
  variant = 'default',
  loading,
  disabled,
  style,
  size,
}: {
  title: string;
  onPress?: PressableProps['onPress'];
  variant?: 'primary' | 'default' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 'lg' | 'sm';
}) {
  const v = {
    primary: { bg: c.mint, fg: c.mintInk, border: c.mint },
    default: { bg: c.slate2, fg: c.paper, border: c.line },
    danger: { bg: 'transparent', fg: c.coral, border: c.coral },
    ghost: { bg: 'transparent', fg: c.fog, border: 'transparent' },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        size === 'lg' && { minHeight: 56, borderRadius: r.md },
        size === 'sm' && { minHeight: 36, paddingHorizontal: 12 },
        { backgroundColor: v.bg, borderColor: v.border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : <Text style={[s.btnText, { color: v.fg }, size === 'lg' && { fontSize: t.lg }, size === 'sm' && { fontSize: t.sm }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, hint, ...rest }: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        placeholderTextColor={c.fog}
        accessibilityLabel={label}
        {...rest}
        style={[s.input, error ? { borderColor: c.coral } : null, rest.style]}
      />
      {hint ? <Text style={[s.small, s.muted]}>{hint}</Text> : null}
      {error ? <Text style={[s.small, { color: c.coral }]}>{error}</Text> : null}
    </View>
  );
}

export function Card({ children, style, onPress, big }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; big?: boolean }) {
  const content = <View style={[s.card, big && { borderRadius: r.lg, padding: 24 }, style]}>{children}</View>;
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'warn' | 'ok'; children: ReactNode }) {
  const m = { info: [c.skySoft, c.sky], error: [c.coralSoft, c.coral], warn: [c.amberSoft, c.amber], ok: [c.mintSoft, c.mint] }[kind];
  return (
    <View accessibilityRole={kind === 'error' ? 'alert' : undefined} style={[s.notice, { backgroundColor: m[0], borderColor: m[1] }]}>
      {typeof children === 'string' ? <Text style={[s.small, { color: c.paper }]}>{children}</Text> : children}
    </View>
  );
}

const TONE: Record<string, [string, string]> = {
  ok: [c.mintSoft, c.mint],
  warn: [c.amberSoft, c.amber],
  bad: [c.coralSoft, c.coral],
  info: [c.skySoft, c.sky],
  none: [c.slate2, c.fog],
};

export function Badge({ label, tone = 'none' }: { label: string; tone?: keyof typeof TONE }) {
  const [bg, fg] = TONE[tone];
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} />
      <Text style={{ color: fg, fontFamily: f.uiBold, fontSize: t.xs }}>{label}</Text>
    </View>
  );
}

const STATUS_TONE: Record<BookingStatus, keyof typeof TONE> = {
  PENDING: 'warn',
  CONFIRMED: 'ok',
  CHECKED_IN: 'info',
  IN_SERVICE: 'info',
  COMPLETED: 'none',
  CANCELLED: 'bad',
  NO_SHOW: 'bad',
};
export const StatusBadge = ({ status }: { status: BookingStatus }) => <Badge label={BOOKING_STATUS_LABEL[status]} tone={STATUS_TONE[status]} />;

const KYC_TONE: Record<KycStatus, keyof typeof TONE> = {
  NOT_STARTED: 'none',
  PENDING: 'warn',
  IN_REVIEW: 'info',
  APPROVED: 'ok',
  REJECTED: 'bad',
  EXPIRED: 'bad',
};
export const KycBadge = ({ status }: { status: KycStatus }) => <Badge label={KYC_STATUS_LABEL[status]} tone={KYC_TONE[status]} />;

export function Loader() {
  return (
    <View style={{ padding: 32, alignItems: 'center' }} accessibilityLabel="Cargando">
      <ActivityIndicator color={c.mint} />
    </View>
  );
}

export function Choice({ title, subtitle, onPress, selected, right }: { title: string; subtitle?: string; onPress: () => void; selected?: boolean; right?: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [s.choice, selected && { borderColor: c.mint }, { opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[s.body, { fontFamily: f.uiBold }]}>{title}</Text>
        {subtitle ? <Text style={[s.small, s.muted]}>{subtitle}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

export const Row = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, style]}>{children}</View>
);

export const s = StyleSheet.create({
  screen: { padding: 16, paddingBottom: 48, gap: 16 },
  h1: { fontFamily: f.brand, fontSize: t.x2, color: c.paper, lineHeight: t.x2 * 1.15 },
  h2: { fontFamily: f.brand, fontSize: t.lg, color: c.paper },
  body: { fontFamily: f.ui, fontSize: t.md, color: c.paper, lineHeight: t.md * 1.5 },
  small: { fontFamily: f.ui, fontSize: t.sm, lineHeight: t.sm * 1.45 },
  muted: { color: c.fog },
  mono: { fontFamily: f.brand, color: c.paper },
  brand: { fontFamily: f.brand, fontSize: t.md, color: c.paper, letterSpacing: 0.6 },
  label: { fontFamily: f.uiBold, fontSize: t.sm, color: c.paper },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    backgroundColor: c.slate2,
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: r.sm,
    color: c.paper,
    fontFamily: f.ui,
    fontSize: t.md,
  },
  btn: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: r.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontFamily: f.uiBold, fontSize: t.md },
  card: { backgroundColor: c.slate, borderColor: c.line, borderWidth: 1, borderRadius: r.md, padding: 18, gap: 8 },
  notice: { borderWidth: 1, borderRadius: r.sm, padding: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: r.md,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.slate,
  },
});
