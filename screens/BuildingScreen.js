// A building: live status, residents, activity log, settings — as bottom tabs.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { api } from '../src/api';
import { C, T } from '../src/theme';
import { todayRange, timeAgo } from '../src/format';
import { EmptyState, Button, IconButton } from '../src/components/ui';
import HomeTab from './building/HomeTab';
import ResidentsTab from './building/ResidentsTab';
import JournalTab from './building/JournalTab';
import SettingsTab from './building/SettingsTab';

const TABS = [
  { key: 'home',      label: 'Accueil',   icon: 'speedometer' },
  { key: 'residents', label: 'Résidents', icon: 'people' },
  { key: 'journal',   label: 'Journal',   icon: 'time' },
  { key: 'settings',  label: 'Réglages',  icon: 'settings' },
];

export default function BuildingScreen({ route, navigation }) {
  const { buildingId } = route.params;
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('home');
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);
  const [hasSeveral, setHasSeveral] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      const { from, to } = todayRange();
      const o = await api(`/elevators/${buildingId}/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setOverview(o);
      setError(null);
      if (o.elevator.floorCount == null) navigation.replace('BuildingSetup', { building: o.elevator, mode: 'setup' });
    } catch (e) {
      setError(e.message);
    }
  }, [buildingId, navigation]);

  useEffect(() => {
    api('/elevators/my').then(list => setHasSeveral(list.length > 1)).catch(() => {});
  }, []);

  // Live status: every 5 s on the home tab, every 30 s elsewhere; paused when the screen is hidden.
  useFocusEffect(useCallback(() => {
    loadOverview();
    const iv = setInterval(loadOverview, tab === 'home' ? 5000 : 30000);
    return () => clearInterval(iv);
  }, [loadOverview, tab]));

  const building = overview?.elevator;

  if (!overview) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        {error ? (
          <EmptyState icon="cloud-offline-outline" title="Chargement impossible" subtitle={error} />
        ) : <ActivityIndicator size="large" color={C.brand} />}
        {error ? <Button title="Réessayer" icon="refresh" onPress={loadOverview} small /> : null}
      </View>
    );
  }

  const tabProps = { building, overview, reload: loadOverview, navigation, setTab };
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <StatusBar style="light" />
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{building.name}</Text>
          <View style={s.onlineRow}>
            <View style={[s.onlineDot, { backgroundColor: building.online ? '#34D399' : '#94A3B8' }]} />
            <Text style={s.onlineText} numberOfLines={1}>
              {building.online
                ? 'Lecteur connecté'
                : `Hors ligne · dernier signal ${timeAgo(building.lastHeartbeat)}`}
            </Text>
          </View>
        </View>
        {hasSeveral ? (
          <IconButton icon="swap-horizontal" color="#fff" bg="rgba(255,255,255,0.14)" onPress={() => navigation.navigate('Buildings')} />
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'home' && <HomeTab {...tabProps} />}
        {tab === 'residents' && <ResidentsTab {...tabProps} />}
        {tab === 'journal' && <JournalTab {...tabProps} />}
        {tab === 'settings' && <SettingsTab {...tabProps} />}
      </View>

      {/* Bottom tabs */}
      <View style={[s.tabBar, { paddingBottom: insets.bottom + 6 }]}>
        {TABS.map(t => {
          const active = t.key === tab;
          return (
            <TouchableOpacity key={t.key} style={s.tab} onPress={() => setTab(t.key)} activeOpacity={0.7}>
              <View style={[s.tabIcon, active && s.tabIconActive]}>
                <Ionicons name={active ? t.icon : `${t.icon}-outline`} size={21} color={active ? C.brand : C.muted} />
              </View>
              <Text style={[s.tabText, active && s.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, padding: 20 },
  header: { backgroundColor: C.brand, paddingHorizontal: 18, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: '#fff', fontSize: 21, fontWeight: '800' },
  onlineRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  onlineText: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600' },
  tabBar: { flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center' },
  tabIcon: { width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  tabIconActive: { backgroundColor: C.brandSoft },
  tabText: { fontSize: 11, color: C.muted, marginTop: 2, fontWeight: '600' },
  tabTextActive: { color: C.brand, fontWeight: '800' },
});
