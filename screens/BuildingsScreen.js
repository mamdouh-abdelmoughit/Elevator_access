// The Syndic's buildings. With a single building we go straight into it;
// a building whose floors were never configured opens the setup wizard first.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { api, getSession, clearSession } from '../src/api';
import { C, T } from '../src/theme';
import { Card, Pill, EmptyState, IconButton } from '../src/components/ui';
import { parseStatus, STATUS_META } from '../src/status';

export const openBuilding = (navigation, building, replace = false) => {
  const route = building.floorCount == null
    ? ['BuildingSetup', { building, mode: 'setup' }]
    : ['Building', { buildingId: building.id }];
  replace ? navigation.replace(...route) : navigation.navigate(...route);
};

export default function BuildingsScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [buildings, setBuildings] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const autoOpened = useRef(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const list = await api('/elevators/my');
      setBuildings(list);
      if (list.length === 1 && !autoOpened.current) {
        autoOpened.current = true;
        openBuilding(navigation, list[0], true);
      }
    } catch (e) {
      setError(e.message);
      setBuildings(b => b || []);
    } finally {
      setRefreshing(false);
    }
  }, [navigation]);

  useEffect(() => {
    getSession().then(({ user }) => setUser(user));
    load();
  }, [load]);

  const logout = () => Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Se déconnecter', style: 'destructive', onPress: async () => {
      await clearSession();
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } },
  ]);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar style="light" />
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.greet}>Bonjour{user?.name ? ',' : ''}</Text>
          <Text style={s.name}>{user?.name || 'Syndic'}</Text>
        </View>
        <IconButton icon="log-out-outline" color="#fff" bg="rgba(255,255,255,0.14)" onPress={logout} />
      </View>

      <View style={s.body}>
      <FlatList
        data={buildings || []}
        keyExtractor={b => String(b.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[C.brand]} />}
        ListHeaderComponent={<Text style={[T.label, { marginBottom: 12 }]}>Mes immeubles</Text>}
        ListEmptyComponent={buildings === null ? null : (
          <EmptyState
            icon={error ? 'cloud-offline-outline' : 'business-outline'}
            title={error ? 'Chargement impossible' : 'Aucun immeuble'}
            subtitle={error || "Aucun immeuble ne vous est encore assigné. Contactez BioSwitch pour qu'il soit rattaché à votre compte."}
          />
        )}
        renderItem={({ item }) => {
          const st = parseStatus(item.currentStatus, item.online);
          const meta = STATUS_META[st.kind];
          return (
            <Card style={s.building} onPress={() => openBuilding(navigation, item)}>
              <View style={s.buildingIcon}><Ionicons name="business" size={24} color={C.brand} /></View>
              <View style={{ flex: 1 }}>
                <Text style={T.h3} numberOfLines={1}>{item.name}</Text>
                <Text style={[T.small, { marginTop: 2 }]} numberOfLines={1}>{item.location}</Text>
                <View style={s.pills}>
                  <Pill label={meta.title} tone={meta.tone} dot />
                  {item.floorCount == null
                    ? <Pill label="À configurer" tone="warning" icon="alert-circle" />
                    : <Pill label={`RDC + ${item.floorCount} étages`} tone="grey" />}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={C.muted} />
            </Card>
          );
        }}
      />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.brand },
  body: { flex: 1, backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 22 },
  greet: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  name: { color: '#fff', fontSize: 24, fontWeight: '800' },
  building: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  buildingIcon: { width: 50, height: 50, borderRadius: 14, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  pills: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
});
