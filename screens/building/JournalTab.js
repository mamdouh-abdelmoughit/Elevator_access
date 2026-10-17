// Full activity log: badge swipes, elevator state changes and syndic actions,
// newest first, grouped by day, loaded page by page.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { api } from '../../src/api';
import { C, T } from '../../src/theme';
import { dayKey, dayLabel } from '../../src/format';
import { Segmented, EmptyState } from '../../src/components/ui';
import ActivityItem from '../../src/components/ActivityItem';

const FILTERS = [
  { value: 'all',     label: 'Tout',     query: 'types=ACCESS,STATE,AUDIT' },
  { value: 'access',  label: 'Passages', query: 'types=ACCESS&status=GRANTED' },
  { value: 'denied',  label: 'Refusés',  query: 'types=ACCESS&status=DENIED' },
  { value: 'state',   label: 'État',     query: 'types=STATE' },
  { value: 'audit',   label: 'Actions',  query: 'types=AUDIT' },
];

export default function JournalTab({ building, navigation }) {
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const reqId = useRef(0);

  const fetchPage = useCallback(async (reset) => {
    const id = ++reqId.current;
    const f = FILTERS.find(x => x.value === filter);
    const c = reset ? null : cursor;
    try {
      const r = await api(`/logs/elevator/${building.id}/activity?${f.query}&limit=40${c ? `&cursor=${c}` : ''}`);
      if (id !== reqId.current) return; // a newer filter was selected meanwhile
      setItems(prev => (reset ? r.items : [...prev, ...r.items]));
      setCursor(r.nextCursor);
      setDone(!r.nextCursor);
      setError(null);
    } catch (e) {
      if (id === reqId.current) setError(e.message);
    } finally {
      if (id === reqId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [building.id, filter, cursor]);

  useEffect(() => {
    setLoading(true); setItems([]); setCursor(null); setDone(false);
    fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, building.id]);

  // Insert a day header before the first item of each day.
  const rows = useMemo(() => {
    const out = [];
    let last = null;
    for (const it of items) {
      const k = dayKey(it.timestamp);
      if (k !== last) { out.push({ header: true, key: `h${k}`, label: dayLabel(it.timestamp) }); last = k; }
      out.push({ key: `i${it.id}`, item: it });
    }
    return out;
  }, [items]);

  const openResident = cardId => navigation.navigate('ResidentDetail', { buildingId: building.id, cardId });

  return (
    <View style={{ flex: 1 }}>
      <View style={s.filters}>
        <Segmented options={FILTERS} value={filter} onChange={setFilter} />
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={C.brand} /> : (
        <FlatList
          data={rows}
          keyExtractor={r => r.key}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPage(true); }} colors={[C.brand]} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (!done && !loading && items.length) fetchPage(false); }}
          renderItem={({ item: r }) => r.header
            ? <Text style={s.day}>{r.label}</Text>
            : <View style={s.itemCard}><ActivityItem item={r.item} onPress={openResident} /></View>}
          ListEmptyComponent={
            <EmptyState
              icon={error ? 'cloud-offline-outline' : 'time-outline'}
              title={error ? 'Chargement impossible' : 'Aucun évènement'}
              subtitle={error || 'Rien à afficher pour ce filtre.'}
            />
          }
          ListFooterComponent={items.length && !done ? <ActivityIndicator style={{ marginVertical: 16 }} color={C.muted} /> : null}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  filters: { padding: 12, paddingBottom: 4 },
  day: { ...T.label, marginTop: 18, marginBottom: 8 },
  itemCard: { backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 12, marginBottom: 6 },
});
