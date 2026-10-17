// An elevator car-call panel: one round button per floor, highest at the top.
//
// mode="home"     tap = choose the resident's floor; RDC/top are shown as "auto"
// mode="multi"    tap = toggle a floor (CUSTOM access); RDC is always on
// mode="readonly" display only
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import { RDC } from '../floors';

const COLS = 4;

export default function FloorPanel({ top, granted = [], home = null, mode = 'readonly', onPress, roofAccess }) {
  const floors = [];
  for (let f = top; f >= 0; f--) floors.push(f);

  // Rows of COLS, top floor first; the last row (with RDC) is left-aligned like a real panel.
  const rows = [];
  for (let i = 0; i < floors.length; i += COLS) rows.push(floors.slice(i, i + COLS));

  const grantedSet = new Set(granted);
  return (
    <View style={s.panel}>
      <View style={s.panelHeader}>
        <View style={s.screen}><Ionicons name="arrow-up" size={12} color="#5EEAD4" /><Ionicons name="arrow-down" size={12} color="#5EEAD4" /></View>
      </View>
      {rows.map((row, i) => (
        <View key={i} style={s.row}>
          {row.map(f => {
            const isHome = home === f;
            const isOn = grantedSet.has(f);
            const isAuto = isOn && !isHome && mode !== 'multi' && (f === RDC || (roofAccess && f === top));
            const locked = mode === 'multi' && f === RDC;
            const tappable = (mode === 'home' || (mode === 'multi' && !locked)) && onPress;
            const variant = isHome ? 'home' : isOn ? (isAuto ? 'auto' : 'on') : 'off';

            let caption = '';
            if (isHome) caption = 'Domicile';
            else if (f === RDC && isOn) caption = 'Sortie';
            else if (roofAccess && f === top && isOn) caption = 'Terrasse';

            return (
              <TouchableOpacity
                key={f}
                disabled={!tappable}
                onPress={() => onPress(f)}
                activeOpacity={0.7}
                style={s.cell}
              >
                <View style={[s.btn, s[`btn_${variant}`]]}>
                  <Text style={[s.btnText, s[`txt_${variant}`]]}>{f === RDC ? 'RDC' : f}</Text>
                  {variant === 'off' ? null : (
                    <View style={[s.led, variant === 'home' ? s.ledHome : s.ledOn]} />
                  )}
                </View>
                <Text style={[s.caption, isHome && { color: C.accent }]} numberOfLines={1}>{caption || ' '}</Text>
              </TouchableOpacity>
            );
          })}
          {Array.from({ length: COLS - row.length }).map((_, k) => <View key={`pad${k}`} style={s.cell} />)}
        </View>
      ))}
      <View style={s.legend}>
        <Legend color={C.accent} label="Domicile" />
        <Legend color={C.success} label="Autorisé" />
        <Legend color="#CBD5E1" label="Bloqué" />
      </View>
    </View>
  );
}

function Legend({ color, label }) {
  return (
    <View style={s.legendItem}>
      <View style={[s.legendDot, { backgroundColor: color }]} />
      <Text style={s.legendText}>{label}</Text>
    </View>
  );
}

const SIZE = 54;
const s = StyleSheet.create({
  panel: {
    backgroundColor: '#E9EDF2', borderRadius: 18, padding: 14, paddingTop: 10,
    borderWidth: 1, borderColor: '#D5DCE5',
  },
  panelHeader: { alignItems: 'center', marginBottom: 10 },
  screen: {
    flexDirection: 'row', gap: 2, backgroundColor: '#0F172A', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  cell: { width: `${100 / COLS}%`, alignItems: 'center' },
  btn: {
    width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3,
  },
  btn_off:  { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' },
  btn_on:   { backgroundColor: C.successSoft, borderColor: C.success },
  btn_auto: { backgroundColor: C.successSoft, borderColor: C.success },
  btn_home: { backgroundColor: C.accent, borderColor: '#1D4ED8' },
  btnText: { fontSize: 16, fontWeight: '800' },
  txt_off:  { color: '#94A3B8' },
  txt_on:   { color: C.success },
  txt_auto: { color: C.success },
  txt_home: { color: '#fff' },
  led: { position: 'absolute', bottom: 7, width: 6, height: 6, borderRadius: 3 },
  ledOn: { backgroundColor: C.success },
  ledHome: { backgroundColor: '#BFDBFE' },
  caption: { fontSize: 10, color: C.sub, marginTop: 3, fontWeight: '600' },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 11, color: C.sub },
});
