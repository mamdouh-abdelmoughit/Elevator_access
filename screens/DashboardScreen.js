import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Modal,
  TextInput, Alert, ActivityIndicator, TouchableOpacity,
  SafeAreaView, ScrollView, RefreshControl, StatusBar,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const C = {
  navy:    '#1B3A6B',
  blue:    '#2563EB',
  green:   '#10B981',
  red:     '#EF4444',
  orange:  '#F59E0B',
  bg:      '#F0F4F8',
  card:    '#FFFFFF',
  text:    '#1E293B',
  sub:     '#64748B',
  border:  '#E2E8F0',
};

// ─── Resident row ────────────────────────────────────────────────────────────
function ResidentCard({ resident, elevatorId, token, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const label    = resident.card?.label || '—';
  const active   = resident.isActive;
  const initials = label.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  const toggle = () => {
    const action      = active ? 'BLOCK' : 'UNBLOCK';
    const actionLabel = active ? 'bloquer' : 'débloquer';
    Alert.alert(
      active ? 'Bloquer le résident' : 'Débloquer le résident',
      `Confirmer : ${actionLabel} l'accès de "${label}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          style: active ? 'destructive' : 'default',
          onPress: async () => {
            setBusy(true);
            try {
              const resp = await fetch(`${API_URL}/elevators/${elevatorId}/access-control`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ cardId: resident.cardId, action }),
              });
              if (resp.ok) {
                onRefresh();
              } else {
                Alert.alert('Erreur', "Impossible de modifier l'accès.");
              }
            } catch {
              Alert.alert('Erreur réseau', 'Vérifiez votre connexion.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={s.residentCard}>
      <View style={[s.avatar, { backgroundColor: active ? '#DBEAFE' : '#FEE2E2' }]}>
        <Text style={[s.avatarText, { color: active ? C.blue : C.red }]}>{initials}</Text>
      </View>

      <View style={s.residentMeta}>
        <Text style={s.residentName} numberOfLines={1}>{label}</Text>
        <View style={[s.statusPill, { backgroundColor: active ? '#D1FAE5' : '#FEE2E2' }]}>
          <Text style={[s.statusPillText, { color: active ? C.green : C.red }]}>
            {active ? '● Actif' : '● Bloqué'}
          </Text>
        </View>
      </View>

      {busy ? (
        <ActivityIndicator size="small" color={C.navy} style={{ marginLeft: 10 }} />
      ) : (
        <TouchableOpacity
          style={[s.toggleBtn, { backgroundColor: active ? '#FEE2E2' : '#D1FAE5' }]}
          onPress={toggle}
          activeOpacity={0.75}
        >
          <Text style={[s.toggleBtnText, { color: active ? C.red : C.green }]}>
            {active ? 'Bloquer' : 'Débloquer'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function DashboardScreen({ route }) {
  const { user } = route.params;

  const [tab,      setTab]      = useState('residents');
  const [token,    setToken]    = useState(null);

  const [elevators,  setElevators]  = useState([]);
  const [residents,  setResidents]  = useState([]);
  const [requests,   setRequests]   = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Resident filters
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  // New-card modal
  const [modalOpen,    setModalOpen]    = useState(false);
  const [ownerName,    setOwnerName]    = useState('');
  const [notes,        setNotes]        = useState('');
  const [submitting,   setSubmitting]   = useState(false);

  // ── card-swipe log sync (silent background) ───────────────────────────────
  const syncAccessLogs = useCallback(async (tok, elevatorList) => {
    try {
      const today = new Date().toISOString().slice(0, 10);

      // Prune entries older than 7 days
      const allKeys = await AsyncStorage.getAllKeys();
      const logKeys = allKeys.filter(k => k.startsWith('swipe_logs_'));
      const cutoff  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const stale   = logKeys.filter(k => k.split('_')[3] < cutoff);
      if (stale.length) await AsyncStorage.multiRemove(stale);

      // Fetch today's logs for each elevator
      await Promise.all(
        elevatorList.map(async (elev) => {
          try {
            const r = await fetch(`${API_URL}/logs/elevator/${elev.id}/access?date=${today}`, {
              headers: { Authorization: `Bearer ${tok}` },
            });
            if (r.ok) {
              const logs = await r.json();
              await AsyncStorage.setItem(`swipe_logs_${elev.id}_${today}`, JSON.stringify(logs));
            }
          } catch { /* silent — offline is fine */ }
        })
      );
    } catch { /* silent */ }
  }, []);

  // ── data fetching ──────────────────────────────────────────────────────────
  const fetchResidents = useCallback(async (tok, elevId) => {
    try {
      const r = await fetch(`${API_URL}/permissions/elevator/${elevId}/residents`, {
        headers: { 'Authorization': `Bearer ${tok}` },
      });
      if (r.ok) {
        const data = await r.json();
        setResidents(data.filter(p => p.card?.label));
      }
    } catch { /* silent */ }
  }, []);

  const loadAll = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const tok = await SecureStore.getItemAsync('authToken');
      setToken(tok);

      const [reqR, elevR] = await Promise.all([
        fetch(`${API_URL}/requests/my`,    { headers: { 'Authorization': `Bearer ${tok}` } }),
        fetch(`${API_URL}/elevators/my`,   { headers: { 'Authorization': `Bearer ${tok}` } }),
      ]);

      if (reqR.ok) {
        const all = await reqR.json();
        setRequests(all.filter(r => r.type === 'NEW_CARD'));
      }

      if (elevR.ok) {
        const elevData = await elevR.json();
        setElevators(elevData);
        if (elevData.length > 0) {
          const firstId = elevData[0].id;
          setSelectedId(firstId);
          await fetchResidents(tok, firstId);
          syncAccessLogs(tok, elevData); // background — no await
        }
      }
    } catch (e) {
      Alert.alert('Erreur', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchResidents]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRefresh = () => { setRefreshing(true); loadAll(true); };

  const selectElevator = async (id) => {
    setSelectedId(id);
    const tok = token || await SecureStore.getItemAsync('authToken');
    await fetchResidents(tok, id);
  };

  // ── new-card request ───────────────────────────────────────────────────────
  const submitNewCard = async () => {
    if (!ownerName.trim()) {
      Alert.alert('Champ requis', 'Veuillez saisir le nom du titulaire.');
      return;
    }
    setSubmitting(true);
    try {
      const tok = token || await SecureStore.getItemAsync('authToken');
      const resp = await fetch(`${API_URL}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
        body: JSON.stringify({
          elevatorId:   selectedId,
          type:         'NEW_CARD',
          residentName: ownerName.trim(),
          notes,
        }),
      });
      if (resp.ok) {
        Alert.alert('Demande envoyée', `Demande de carte pour "${ownerName.trim()}" transmise à l'administrateur.`);
        setModalOpen(false);
        setOwnerName('');
        setNotes('');
        loadAll(true);
      } else {
        Alert.alert('Erreur', "Impossible d'envoyer la demande.");
      }
    } catch {
      Alert.alert('Erreur réseau', 'Vérifiez votre connexion.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── derived data ───────────────────────────────────────────────────────────
  const filteredResidents = residents
    .filter(r => {
      if (filter === 'active')  return  r.isActive;
      if (filter === 'blocked') return !r.isActive;
      return true;
    })
    .filter(r => r.card?.label?.toLowerCase().includes(search.toLowerCase()));

  const currentBuilding = elevators.find(e => e.id === selectedId);
  const pendingCount    = requests.filter(r => r.status === 'PENDING').length;

  const reqStatusColor = st =>
    st === 'PENDING' ? C.orange : st === 'COMPLETED' ? C.green : C.red;
  const reqStatusLabel = st =>
    st === 'PENDING' ? 'En attente' : st === 'COMPLETED' ? 'Validée' : 'Rejetée';

  // ── loading splash ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.splash}>
        <ActivityIndicator size="large" color={C.navy} />
        <Text style={s.splashText}>Chargement…</Text>
      </View>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy} />

      {/* ── Header ── */}
      <View style={s.header}>
        <View>
          <Text style={s.headerGreet}>Bonjour,</Text>
          <Text style={s.headerName}>{user.name}</Text>
        </View>
        <View style={s.headerRight}>
          <Text style={s.headerBuilding} numberOfLines={1}>
            {currentBuilding?.name || '—'}
          </Text>
        </View>
      </View>

      {/* ── Building chips (if multiple) ── */}
      {elevators.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.chipBar}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 10 }}
        >
          {elevators.map(e => (
            <TouchableOpacity
              key={e.id}
              style={[s.chip, selectedId === e.id && s.chipActive]}
              onPress={() => selectElevator(e.id)}
            >
              <Text style={[s.chipText, selectedId === e.id && s.chipTextActive]}>
                {e.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── Tabs ── */}
      <View style={s.tabBar}>
        {[
          { key: 'residents', label: 'Résidents' },
          { key: 'buildings', label: 'Immeubles' },
          { key: 'requests',  label: 'Demandes', badge: pendingCount },
        ].map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tabItem, tab === t.key && s.tabItemActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
            {t.badge > 0 && (
              <View style={s.tabBadge}><Text style={s.tabBadgeText}>{t.badge}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ══════════════ TAB: RÉSIDENTS ══════════════ */}
      {tab === 'residents' && (
        <View style={s.flex}>
          {/* Search */}
          <View style={s.searchWrap}>
            <TextInput
              style={s.searchInput}
              placeholder="Rechercher un résident…"
              placeholderTextColor={C.sub}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {/* Filter pills */}
          <View style={s.filterRow}>
            {[
              { key: 'all',     label: 'Tous' },
              { key: 'active',  label: 'Actifs' },
              { key: 'blocked', label: 'Bloqués' },
            ].map(f => (
              <TouchableOpacity
                key={f.key}
                style={[s.pill, filter === f.key && s.pillActive]}
                onPress={() => setFilter(f.key)}
              >
                <Text style={[s.pillText, filter === f.key && s.pillTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
            <Text style={s.countLabel}>{filteredResidents.length} résidents</Text>
          </View>

          <FlatList
            data={filteredResidents}
            keyExtractor={(item, i) => item.id?.toString() ?? i.toString()}
            renderItem={({ item }) => (
              <ResidentCard
                resident={item}
                elevatorId={selectedId}
                token={token}
                onRefresh={() => fetchResidents(token, selectedId)}
              />
            )}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={s.emptyText}>Aucun résident trouvé.</Text>
              </View>
            }
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[C.navy]} />
            }
          />
        </View>
      )}

      {/* ══════════════ TAB: IMMEUBLES ══════════════ */}
      {tab === 'buildings' && (
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          {elevators.length === 0 ? (
            <View style={s.empty}><Text style={s.emptyText}>Aucun immeuble assigné.</Text></View>
          ) : (
            elevators.map(e => {
              const eResidents = e.id === selectedId ? residents : [];
              return (
                <View key={e.id} style={s.buildingCard}>
                  <View style={s.buildingCardTop}>
                    <Text style={s.buildingName}>{e.name}</Text>
                    <View style={[
                      s.elevStatus,
                      { backgroundColor: e.currentStatus === 'IDLE' ? '#D1FAE5' : '#FEF3C7' },
                    ]}>
                      <Text style={[
                        s.elevStatusText,
                        { color: e.currentStatus === 'IDLE' ? C.green : C.orange },
                      ]}>
                        {e.currentStatus || 'Inconnu'}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.buildingLoc}>📍 {e.location}</Text>

                  {e.id === selectedId && (
                    <View style={s.statsRow}>
                      <View style={s.statCell}>
                        <Text style={[s.statNum, { color: C.green }]}>
                          {residents.filter(r => r.isActive).length}
                        </Text>
                        <Text style={s.statLabel}>Actifs</Text>
                      </View>
                      <View style={s.statDivider} />
                      <View style={s.statCell}>
                        <Text style={[s.statNum, { color: C.red }]}>
                          {residents.filter(r => !r.isActive).length}
                        </Text>
                        <Text style={s.statLabel}>Bloqués</Text>
                      </View>
                      <View style={s.statDivider} />
                      <View style={s.statCell}>
                        <Text style={s.statNum}>{residents.length}</Text>
                        <Text style={s.statLabel}>Total</Text>
                      </View>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ══════════════ TAB: DEMANDES ══════════════ */}
      {tab === 'requests' && (
        <View style={s.flex}>
          <View style={s.requestsTopBar}>
            <Text style={s.requestsTitle}>Demandes de nouvelles cartes</Text>
            <TouchableOpacity style={s.newCardBtn} onPress={() => setModalOpen(true)}>
              <Text style={s.newCardBtnText}>+ Nouvelle carte</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={requests}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[C.navy]} />
            }
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={s.emptyText}>Aucune demande pour l'instant.</Text>
                <Text style={[s.emptyText, s.emptyHint]}>
                  Appuyez sur "+ Nouvelle carte" pour demander une nouvelle carte d'accès.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={s.requestCard}>
                <View style={s.requestCardTop}>
                  <View style={s.reqTypePill}>
                    <Text style={s.reqTypePillText}>🪪 Nouvelle Carte</Text>
                  </View>
                  <View style={[s.reqStatusChip, { backgroundColor: reqStatusColor(item.status) + '22' }]}>
                    <View style={[s.reqDot, { backgroundColor: reqStatusColor(item.status) }]} />
                    <Text style={[s.reqStatusText, { color: reqStatusColor(item.status) }]}>
                      {reqStatusLabel(item.status)}
                    </Text>
                  </View>
                </View>
                <Text style={s.reqResident}>👤 {item.residentName}</Text>
                <Text style={s.reqBuilding}>🏢 {item.elevator?.name || '—'}</Text>
                {item.notes ? <Text style={s.reqNotes}>📝 {item.notes}</Text> : null}
                <Text style={s.reqDate}>
                  {new Date(item.createdAt).toLocaleDateString('fr-FR', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </Text>
              </View>
            )}
          />
        </View>
      )}

      {/* ══════════════ MODAL: NEW CARD REQUEST ══════════════ */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Demander une nouvelle carte</Text>
            <Text style={s.modalSubtitle}>
              Cette demande sera transmise à l'administrateur pour approbation.
            </Text>

            <Text style={s.mLabel}>Nom complet du titulaire *</Text>
            <TextInput
              style={s.mInput}
              placeholder="Ex : M. Benali — Apt 12"
              placeholderTextColor={C.sub}
              value={ownerName}
              onChangeText={setOwnerName}
              autoCapitalize="words"
            />

            <Text style={s.mLabel}>Immeuble</Text>
            <View style={s.mValue}>
              <Text style={{ color: C.text }}>{currentBuilding?.name || '—'}</Text>
            </View>

            <Text style={s.mLabel}>Remarques (optionnel)</Text>
            <TextInput
              style={[s.mInput, { height: 80 }]}
              placeholder="Informations complémentaires…"
              placeholderTextColor={C.sub}
              value={notes}
              onChangeText={setNotes}
              multiline
              textAlignVertical="top"
            />

            <View style={s.modalBtns}>
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => { setModalOpen(false); setOwnerName(''); setNotes(''); }}
              >
                <Text style={s.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.submitBtn, submitting && { opacity: 0.65 }]}
                onPress={submitNewCard}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color="white" />
                  : <Text style={s.submitBtnText}>Envoyer la demande</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: C.bg },

  splash: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  splashText: { marginTop: 12, color: C.sub, fontSize: 16 },

  // Header
  header: {
    backgroundColor: C.navy,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerGreet: { color: 'rgba(255,255,255,0.65)', fontSize: 13 },
  headerName:  { color: 'white', fontSize: 20, fontWeight: '800' },
  headerRight: { alignItems: 'flex-end', maxWidth: 160 },
  headerBuilding: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },

  // Building chips
  chipBar: { backgroundColor: C.navy },
  chip: {
    paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  chipActive:    { backgroundColor: 'white' },
  chipText:      { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  chipTextActive: { color: C.navy, fontWeight: '700' },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tabItem: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', position: 'relative',
  },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: C.navy },
  tabText:       { fontSize: 13, color: C.sub, fontWeight: '500' },
  tabTextActive: { color: C.navy, fontWeight: '700' },
  tabBadge: {
    backgroundColor: C.red, borderRadius: 9, minWidth: 18, height: 18,
    justifyContent: 'center', alignItems: 'center', marginLeft: 5, paddingHorizontal: 4,
  },
  tabBadgeText: { color: 'white', fontSize: 10, fontWeight: '800' },

  // Search & filter
  searchWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  searchInput: {
    backgroundColor: 'white', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, borderWidth: 1, borderColor: C.border, color: C.text,
  },
  filterRow:     { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 10, alignItems: 'center', gap: 8 },
  pill:          { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: C.border },
  pillActive:    { backgroundColor: C.navy, borderColor: C.navy },
  pillText:      { fontSize: 12, color: C.sub },
  pillTextActive: { color: 'white', fontWeight: '600' },
  countLabel:    { marginLeft: 'auto', fontSize: 12, color: C.sub },

  // Resident card
  residentCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 10,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 1 }, shadowRadius: 4,
  },
  avatar:       { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText:   { fontSize: 16, fontWeight: '800' },
  residentMeta: { flex: 1 },
  residentName: { fontSize: 15, fontWeight: '600', color: C.text, marginBottom: 4 },
  statusPill:   { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusPillText: { fontSize: 11, fontWeight: '600' },
  toggleBtn:    { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 8, marginLeft: 10 },
  toggleBtnText: { fontSize: 12, fontWeight: '700' },

  // Building card
  buildingCard: {
    backgroundColor: 'white', borderRadius: 14, padding: 18, marginBottom: 14,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.07, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6,
  },
  buildingCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  buildingName:    { fontSize: 18, fontWeight: '800', color: C.text, flex: 1, marginRight: 10 },
  buildingLoc:     { fontSize: 13, color: C.sub, marginBottom: 16 },
  elevStatus:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  elevStatusText:  { fontSize: 12, fontWeight: '600' },
  statsRow:        { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border },
  statCell:        { alignItems: 'center' },
  statNum:         { fontSize: 24, fontWeight: '800', color: C.navy },
  statLabel:       { fontSize: 12, color: C.sub, marginTop: 2 },
  statDivider:     { width: 1, backgroundColor: C.border },

  // Requests tab
  requestsTopBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16,
  },
  requestsTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  newCardBtn:    { backgroundColor: C.navy, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 8 },
  newCardBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },

  requestCard: {
    backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 10,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3,
  },
  requestCardTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  reqTypePill:     { backgroundColor: '#DBEAFE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  reqTypePillText: { fontSize: 12, fontWeight: '600', color: C.blue },
  reqStatusChip:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, gap: 5 },
  reqDot:          { width: 6, height: 6, borderRadius: 3 },
  reqStatusText:   { fontSize: 11, fontWeight: '600' },
  reqResident:     { fontSize: 15, fontWeight: '600', color: C.text, marginBottom: 4 },
  reqBuilding:     { fontSize: 13, color: C.sub, marginBottom: 4 },
  reqNotes:        { fontSize: 13, color: C.sub, marginBottom: 4 },
  reqDate:         { fontSize: 12, color: C.sub, marginTop: 4 },

  // Empty state
  empty:     { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: C.sub, fontSize: 15, textAlign: 'center', paddingHorizontal: 30 },
  emptyHint: { fontSize: 13, marginTop: 6 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36,
  },
  modalHandle:   { width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle:    { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 6 },
  modalSubtitle: { fontSize: 13, color: C.sub, marginBottom: 20, lineHeight: 20 },
  mLabel:        { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 14, marginBottom: 6 },
  mInput: {
    backgroundColor: C.bg, borderRadius: 10, padding: 14, fontSize: 14,
    color: C.text, borderWidth: 1, borderColor: C.border,
  },
  mValue: {
    backgroundColor: C.bg, borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: C.border,
  },
  modalBtns:    { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn:    { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  cancelBtnText: { color: C.sub, fontWeight: '600' },
  submitBtn:    { flex: 2, paddingVertical: 14, borderRadius: 10, backgroundColor: C.navy, alignItems: 'center' },
  submitBtnText: { color: 'white', fontWeight: '700', fontSize: 15 },
});
