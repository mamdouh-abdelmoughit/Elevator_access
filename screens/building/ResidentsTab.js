// Residents grouped by floor, with search and status filters.
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, SectionList, TouchableOpacity, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api';
import { C, R, T, shadow } from '../../src/theme';
import { timeAgo } from '../../src/format';
import { floorLong, ACCESS_TYPES } from '../../src/floors';
import { Avatar, Pill, FloorChips, Field, ChipSelect, EmptyState } from '../../src/components/ui';

const statusOf = r => (r.expired ? 'expired' : r.isActive ? 'active' : 'blocked');

export default function ResidentsTab({ building, navigation }) {
  const [residents, setResidents] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      setResidents(await api(`/elevators/${building.id}/residents`));
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, [building.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const counts = useMemo(() => {
    const c = { all: 0, active: 0, blocked: 0, expired: 0 };
    (residents || []).forEach(r => { c.all++; c[statusOf(r)]++; });
    return c;
  }, [residents]);

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (residents || []).filter(r =>
      (filter === 'all' || statusOf(r) === filter) &&
      (!q || [r.name, r.apartment, r.code, r.phone].some(v => v && String(v).toLowerCase().includes(q))));

    const groups = new Map();
    for (const r of list) {
      const key = r.accessType === 'STAFF' ? 'staff' : r.accessType === 'CUSTOM' ? 'custom' : `f${r.homeFloor}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    const order = k => (k === 'staff' ? -2 : k === 'custom' ? -1 : 100 - parseInt(k.slice(1), 10));
    return [...groups.entries()]
      .sort((a, b) => order(a[0]) - order(b[0])) // staff, custom, then top floor -> RDC
      .map(([key, data]) => ({
        key,
        title: key === 'staff' ? 'Personnel' : key === 'custom' ? 'Accès personnalisé' : floorLong(parseInt(key.slice(1), 10)),
        icon: key === 'staff' ? 'briefcase' : key === 'custom' ? 'options' : 'home',
        data,
      }));
  }, [residents, search, filter]);

  const open = r => navigation.navigate('ResidentDetail', { buildingId: building.id, cardId: r.cardId });

  if (residents === null) {
    return error
      ? <EmptyState icon="cloud-offline-outline" title="Chargement impossible" subtitle={error} action="Réessayer" onAction={load} />
      : <ActivityIndicator style={{ marginTop: 40 }} color={C.brand} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        sections={sections}
        keyExtractor={r => String(r.cardId)}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[C.brand]} />}
        ListHeaderComponent={
          <View style={{ paddingTop: 14 }}>
            <Field
              icon="search"
              placeholder="Nom, appartement, code badge…"
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              style={{ marginBottom: 10 }}
              right={search ? (
                <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color={C.muted} /></TouchableOpacity>
              ) : null}
            />
            <ChipSelect
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'Tous', count: counts.all },
                { value: 'active', label: 'Actifs', count: counts.active },
                { value: 'blocked', label: 'Bloqués', count: counts.blocked },
                ...(counts.expired ? [{ value: 'expired', label: 'Expirés', count: counts.expired }] : []),
              ]}
            />
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={s.sectionHeader}>
            <Ionicons name={section.icon} size={14} color={C.sub} />
            <Text style={T.label}>{section.title}</Text>
            <Text style={s.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item }) => <ResidentRow r={item} onPress={() => open(item)} />}
        ListEmptyComponent={
          residents.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="Aucun résident"
              subtitle="Ajoutez les résidents de l'immeuble et attribuez-leur un badge."
              action="Ajouter un résident"
              onAction={() => navigation.navigate('ResidentForm', { building })}
            />
          ) : <EmptyState icon="search" title="Aucun résultat" subtitle="Modifiez la recherche ou le filtre." />
        }
      />

      <TouchableOpacity style={s.fab} activeOpacity={0.85} onPress={() => navigation.navigate('ResidentForm', { building })}>
        <Ionicons name="person-add" size={22} color="#fff" />
        <Text style={s.fabText}>Ajouter</Text>
      </TouchableOpacity>
    </View>
  );
}

function ResidentRow({ r, onPress }) {
  const status = statusOf(r);
  const tone = status === 'active' ? (ACCESS_TYPES[r.accessType]?.tone || 'accent') : status === 'expired' ? 'warning' : 'danger';
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.8}>
      <Avatar name={r.name} tone={tone} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[T.h3, { flexShrink: 1 }]} numberOfLines={1}>{r.name}</Text>
          {status === 'blocked' ? <Pill label="Bloqué" tone="danger" /> : null}
          {status === 'expired' ? <Pill label="Expiré" tone="warning" /> : null}
        </View>
        <Text style={[T.small, { marginTop: 2 }]} numberOfLines={1}>
          {[r.apartment && `Apt ${r.apartment}`, r.lastSeen ? `vu ${timeAgo(r.lastSeen)}` : 'jamais utilisé'].filter(Boolean).join(' · ')}
        </Text>
        <View style={{ marginTop: 7 }}>
          <FloorChips floors={r.floors} tone={status === 'active' ? 'success' : 'grey'} />
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20, marginBottom: 8 },
  sectionCount: { fontSize: 11, fontWeight: '800', color: C.sub, backgroundColor: C.greySoft, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: R.lg, padding: 14, marginBottom: 8, ...shadow },
  fab: {
    position: 'absolute', right: 18, bottom: 18, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.brand, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 30, ...shadow, elevation: 6,
  },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
