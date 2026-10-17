// Shared UI building blocks.
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, Animated, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { C, R, T, TONES, shadow } from '../theme';

// ── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, style, onPress }) {
  const Comp = onPress ? TouchableOpacity : View;
  return (
    <Comp activeOpacity={0.85} onPress={onPress} style={[s.card, style]}>
      {children}
    </Comp>
  );
}

// ── Button ───────────────────────────────────────────────────────────────────
const BTN = {
  primary:   { bg: C.brand,       fg: '#fff',     border: C.brand },
  accent:    { bg: C.accent,      fg: '#fff',     border: C.accent },
  secondary: { bg: '#fff',        fg: C.brand,    border: C.border },
  danger:    { bg: C.dangerSoft,  fg: C.danger,   border: C.dangerSoft },
  success:   { bg: C.successSoft, fg: C.success,  border: C.successSoft },
  ghost:     { bg: 'transparent', fg: C.brand,    border: 'transparent' },
};

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, small, style }) {
  const v = BTN[variant];
  const off = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.8}
      style={[
        s.btn, small && s.btnSmall,
        { backgroundColor: v.bg, borderColor: v.border, opacity: off ? 0.55 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 16 : 18} color={v.fg} style={{ marginRight: title ? 8 : 0 }} /> : null}
          {title ? <Text style={[s.btnText, small && s.btnTextSmall, { color: v.fg }]}>{title}</Text> : null}
        </>
      )}
    </TouchableOpacity>
  );
}

export function IconButton({ icon, onPress, color = C.text, bg = 'transparent', size = 22, style, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={[s.iconBtn, { backgroundColor: bg, opacity: disabled ? 0.4 : 1 }, style]}
    >
      <Ionicons name={icon} size={size} color={color} />
    </TouchableOpacity>
  );
}

// ── Pill / badge ─────────────────────────────────────────────────────────────
export function Pill({ label, tone = 'grey', icon, style, dot }) {
  const [fg, bg] = TONES[tone];
  return (
    <View style={[s.pill, { backgroundColor: bg }, style]}>
      {dot ? <View style={[s.dot, { backgroundColor: fg }]} /> : null}
      {icon ? <Ionicons name={icon} size={12} color={fg} style={{ marginRight: 4 }} /> : null}
      <Text style={[s.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

// Small floor chips: RDC 2 5
export function FloorChips({ floors, tone = 'brand', max = 6 }) {
  const [fg, bg] = TONES[tone];
  const shown = floors.slice(0, max);
  return (
    <View style={s.chipRow}>
      {shown.map(f => (
        <View key={f} style={[s.floorChip, { backgroundColor: bg }]}>
          <Text style={[s.floorChipText, { color: fg }]}>{f === 0 ? 'RDC' : f}</Text>
        </View>
      ))}
      {floors.length > max ? <Text style={T.small}>+{floors.length - max}</Text> : null}
    </View>
  );
}

// ── Avatar ───────────────────────────────────────────────────────────────────
export function Avatar({ name, tone = 'brand', size = 44, icon }) {
  const [fg, bg] = TONES[tone];
  const initials = (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      {icon
        ? <Ionicons name={icon} size={size * 0.45} color={fg} />
        : <Text style={{ color: fg, fontWeight: '800', fontSize: size * 0.36 }}>{initials}</Text>}
    </View>
  );
}

// ── Section title ────────────────────────────────────────────────────────────
export function SectionTitle({ title, action, onAction, style }) {
  return (
    <View style={[s.sectionTitle, style]}>
      <Text style={T.label}>{title}</Text>
      {action ? (
        <TouchableOpacity onPress={onAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.sectionAction}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
export function EmptyState({ icon = 'file-tray-outline', title, subtitle, action, onAction }) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}><Ionicons name={icon} size={30} color={C.muted} /></View>
      <Text style={[T.h3, { textAlign: 'center' }]}>{title}</Text>
      {subtitle ? <Text style={[T.sub, s.emptySub]}>{subtitle}</Text> : null}
      {action ? <Button title={action} onPress={onAction} small style={{ marginTop: 16 }} icon="add" /> : null}
    </View>
  );
}

// ── Form field ───────────────────────────────────────────────────────────────
export function Field({ label, hint, error, icon, right, style, inputStyle, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ marginBottom: 14 }, style]}>
      {label ? <Text style={s.fieldLabel}>{label}</Text> : null}
      <View style={[s.inputWrap, focused && s.inputFocused, error && s.inputError]}>
        {icon ? <Ionicons name={icon} size={18} color={focused ? C.accent : C.muted} style={{ marginRight: 8 }} /> : null}
        <TextInput
          placeholderTextColor={C.muted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[s.input, inputStyle]}
          {...props}
        />
        {right}
      </View>
      {error ? <Text style={s.fieldError}>{error}</Text> : hint ? <Text style={s.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

// ── Segmented control ────────────────────────────────────────────────────────
export function Segmented({ options, value, onChange, style }) {
  return (
    <View style={[s.segment, style]}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => onChange(o.value)}
            activeOpacity={0.8}
            style={[s.segmentItem, active && s.segmentItemActive]}
          >
            {o.icon ? <Ionicons name={o.icon} size={15} color={active ? C.brand : C.sub} style={{ marginRight: 5 }} /> : null}
            <Text style={[s.segmentText, active && s.segmentTextActive]} numberOfLines={1}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Horizontal chips (filters). options: [{ value, label, count? }]
export function ChipSelect({ options, value, onChange, style }) {
  return (
    <View style={[s.chipRow, { flexWrap: 'wrap' }, style]}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[s.chip, active && s.chipActive]}
            activeOpacity={0.8}
          >
            <Text style={[s.chipText, active && s.chipTextActive]}>
              {o.label}{o.count !== undefined ? `  ${o.count}` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Stat tile ────────────────────────────────────────────────────────────────
export function StatTile({ icon, value, label, tone = 'brand', onPress }) {
  const [fg, bg] = TONES[tone];
  return (
    <Card style={s.stat} onPress={onPress}>
      <View style={[s.statIcon, { backgroundColor: bg }]}><Ionicons name={icon} size={18} color={fg} /></View>
      <Text style={s.statValue}>{value ?? '—'}</Text>
      <Text style={T.small} numberOfLines={1}>{label}</Text>
    </Card>
  );
}

// ── Info row (label / value) ─────────────────────────────────────────────────
export function InfoRow({ icon, label, value, onPress, last, valueStyle }) {
  const Comp = onPress ? TouchableOpacity : View;
  return (
    <Comp onPress={onPress} style={[s.infoRow, !last && s.infoRowBorder]}>
      <Ionicons name={icon} size={18} color={C.sub} style={{ width: 26 }} />
      <Text style={[T.sub, { flex: 1 }]}>{label}</Text>
      <Text style={[T.body, { fontWeight: '600', maxWidth: '60%', textAlign: 'right' }, valueStyle]} numberOfLines={2}>{value}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={C.muted} style={{ marginLeft: 4 }} /> : null}
    </Comp>
  );
}

// ── Screen header (back button + title + optional right action) ─────────────
export function Header({ title, subtitle, onBack, right, dark }) {
  const insets = useSafeAreaInsets();
  const fg = dark ? '#fff' : C.text;
  return (
    <View style={[s.header, { paddingTop: insets.top + 8, backgroundColor: dark ? C.brand : C.card }, !dark && s.headerLight]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {onBack ? <IconButton icon="chevron-back" onPress={onBack} color={fg} size={24} style={{ marginRight: 6 }} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[T.h2, { color: fg }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[T.small, { color: dark ? 'rgba(255,255,255,0.7)' : C.sub }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

// ── Toasts ───────────────────────────────────────────────────────────────────
const ToastContext = createContext({ show: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  const show = useCallback((message, tone = 'success') => {
    clearTimeout(timer.current);
    setToast({ message, tone });
    Animated.spring(anim, { toValue: 1, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
    }, 2800);
  }, [anim]);

  const value = useMemo(() => ({ show }), [show]); // stable: safe in hook deps
  const [fg, bg] = TONES[toast?.tone || 'success'];
  const icon = toast?.tone === 'danger' ? 'alert-circle' : toast?.tone === 'warning' ? 'warning' : 'checkmark-circle';
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[s.toast, {
            top: insets.top + 10, backgroundColor: bg, borderColor: fg,
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
          }]}
        >
          <Ionicons name={icon} size={20} color={fg} />
          <Text style={[s.toastText, { color: fg }]}>{toast.message}</Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: R.lg, padding: 16, ...shadow },

  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, paddingHorizontal: 18, borderRadius: R.md, borderWidth: 1,
  },
  btnSmall: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: R.sm },
  btnText: { fontSize: 15, fontWeight: '700' },
  btnTextSmall: { fontSize: 13 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: R.pill },
  pillText: { fontSize: 11, fontWeight: '700' },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },

  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  floorChip: { minWidth: 26, height: 22, borderRadius: 6, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  floorChipText: { fontSize: 11, fontWeight: '800' },

  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, marginBottom: 10 },
  sectionAction: { color: C.accent, fontWeight: '700', fontSize: 13 },

  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 30 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.greySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptySub: { textAlign: 'center', marginTop: 6, lineHeight: 19 },

  fieldLabel: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 7 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.card,
    borderRadius: R.md, borderWidth: 1.5, borderColor: C.border, paddingHorizontal: 13,
  },
  inputFocused: { borderColor: C.accent },
  inputError: { borderColor: C.danger },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, color: C.text },
  fieldHint: { fontSize: 12, color: C.sub, marginTop: 5 },
  fieldError: { fontSize: 12, color: C.danger, marginTop: 5, fontWeight: '600' },

  segment: { flexDirection: 'row', backgroundColor: C.greySoft, borderRadius: R.md, padding: 4 },
  segmentItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: R.sm },
  segmentItemActive: { backgroundColor: C.card, ...shadow },
  segmentText: { fontSize: 13, color: C.sub, fontWeight: '600' },
  segmentTextActive: { color: C.brand, fontWeight: '800' },

  chip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: R.pill, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.brand, borderColor: C.brand },
  chipText: { fontSize: 12, color: C.sub, fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  stat: { flex: 1, padding: 14 },
  statIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 24, fontWeight: '800', color: C.text },

  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: C.divider },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 12 },
  headerLight: { borderBottomWidth: 1, borderBottomColor: C.border },

  toast: {
    position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 13, paddingHorizontal: 15, borderRadius: R.md, borderWidth: 1, ...shadow,
  },
  toastText: { flex: 1, fontSize: 14, fontWeight: '700' },
});
