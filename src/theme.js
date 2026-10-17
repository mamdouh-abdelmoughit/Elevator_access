// Design tokens for the Syndic app.
export const C = {
  brand:      '#1B3A6B',
  brandDark:  '#122849',
  brandSoft:  '#E8EEF8',
  accent:     '#2563EB',
  accentSoft: '#DBEAFE',

  bg:      '#F3F6FA',
  card:    '#FFFFFF',
  text:    '#0F172A',
  sub:     '#64748B',
  muted:   '#94A3B8',
  border:  '#E2E8F0',
  divider: '#EEF2F7',

  success:     '#059669',
  successSoft: '#D1FAE5',
  danger:      '#DC2626',
  dangerSoft:  '#FEE2E2',
  warning:     '#D97706',
  warningSoft: '#FEF3C7',
  purple:      '#7C3AED',
  purpleSoft:  '#EDE9FE',
  grey:        '#64748B',
  greySoft:    '#F1F5F9',
};

// tone -> [foreground, background]
export const TONES = {
  brand:   [C.brand, C.brandSoft],
  accent:  [C.accent, C.accentSoft],
  success: [C.success, C.successSoft],
  danger:  [C.danger, C.dangerSoft],
  warning: [C.warning, C.warningSoft],
  purple:  [C.purple, C.purpleSoft],
  grey:    [C.grey, C.greySoft],
};

export const R = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

export const shadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

export const T = {
  h1:      { fontSize: 24, fontWeight: '800', color: C.text },
  h2:      { fontSize: 18, fontWeight: '800', color: C.text },
  h3:      { fontSize: 15, fontWeight: '700', color: C.text },
  body:    { fontSize: 14, color: C.text },
  sub:     { fontSize: 13, color: C.sub },
  small:   { fontSize: 12, color: C.sub },
  label:   { fontSize: 12, fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.6 },
  mono:    { fontFamily: 'monospace' },
};
