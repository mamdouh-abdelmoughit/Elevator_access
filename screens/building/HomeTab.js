// Home: live elevator status, "accès libre", today's numbers, quick actions,
// latest activity.
import React, { useState } from 'react';
import { View, Text, ScrollView, Switch, TouchableOpacity, RefreshControl, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api';
import { C, R, T, TONES } from '../../src/theme';
import { timeAgo } from '../../src/format';
import { parseStatus, STATUS_META } from '../../src/status';
import { Card, StatTile, SectionTitle, EmptyState, useToast } from '../../src/components/ui';
import ActivityItem from '../../src/components/ActivityItem';
import CaptureModal from '../../src/components/CaptureModal';

export default function HomeTab({ building, overview, reload, navigation, setTab }) {
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [togglingFree, setTogglingFree] = useState(false);
  const [identifyOpen, setIdentifyOpen] = useState(false);

  const st = parseStatus(building.currentStatus, building.online);
  const meta = STATUS_META[st.kind];
  const [fg, bg] = TONES[meta.tone];
  const stats = overview.stats;

  const toggleFreeAccess = (value) => {
    Alert.alert(
      value ? 'Activer l’accès libre ?' : 'Désactiver l’accès libre ?',
      value
        ? 'Tous les boutons de la cabine fonctionneront SANS badge jusqu’à désactivation. Pratique pour un déménagement ou une intervention.'
        : 'Les boutons ne fonctionneront à nouveau qu’après le passage d’un badge autorisé.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: value ? 'Activer' : 'Désactiver',
          style: value ? 'destructive' : 'default',
          onPress: async () => {
            setTogglingFree(true);
            try {
              await api(`/elevators/${building.id}/command`, { method: 'POST', body: { commandType: value ? 'FREE_ACCESS_ON' : 'FREE_ACCESS_OFF' } });
              toast.show(value ? 'Accès libre activé' : 'Accès libre désactivé', value ? 'warning' : 'success');
              await reload();
            } catch (e) {
              toast.show(e.message, 'danger');
            } finally {
              setTogglingFree(false);
            }
          },
        },
      ],
    );
  };

  const openResident = cardId => navigation.navigate('ResidentDetail', { buildingId: building.id, cardId });

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} colors={[C.brand]} />}
    >
      {/* Live status */}
      <Card style={[s.statusCard, { borderLeftColor: fg }]}>
        <View style={s.statusTop}>
          <View style={[s.statusIcon, { backgroundColor: bg }]}><Ionicons name={meta.icon} size={28} color={fg} /></View>
          <View style={{ flex: 1 }}>
            <Text style={T.label}>État de l'ascenseur</Text>
            <Text style={[s.statusTitle, { color: fg }]}>{meta.title}</Text>
          </View>
          {building.online ? (
            <View style={s.live}><View style={s.liveDot} /><Text style={s.liveText}>EN DIRECT</Text></View>
          ) : null}
        </View>
        {st.lines.length ? (
          <View style={s.signals}>
            {st.lines.map(l => (
              <View key={l} style={s.signal}><View style={[s.signalDot, { backgroundColor: fg }]} /><Text style={T.body}>{l}</Text></View>
            ))}
          </View>
        ) : null}
        <Text style={[T.small, { marginTop: 10 }]}>
          {building.online ? `Mis à jour ${timeAgo(building.lastHeartbeat)}` : `Dernier signal ${timeAgo(building.lastHeartbeat)} — vérifiez le WiFi du local machinerie.`}
        </Text>
      </Card>

      {/* Free access */}
      <Card style={[s.freeCard, building.freeAccess && s.freeCardOn]}>
        <View style={[s.freeIcon, { backgroundColor: building.freeAccess ? C.warning : C.greySoft }]}>
          <Ionicons name={building.freeAccess ? 'lock-open' : 'lock-closed'} size={20} color={building.freeAccess ? '#fff' : C.sub} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={T.h3}>Accès libre</Text>
          <Text style={[T.small, { marginTop: 2 }]}>
            {building.freeAccess ? 'Tous les étages sont accessibles sans badge.' : 'Badge requis pour utiliser les boutons.'}
          </Text>
        </View>
        <Switch
          value={!!building.freeAccess}
          disabled={togglingFree}
          onValueChange={toggleFreeAccess}
          trackColor={{ true: C.warning, false: C.border }}
          thumbColor="#fff"
        />
      </Card>

      {/* Stats */}
      <SectionTitle title="Aujourd'hui" />
      <View style={s.grid}>
        <StatTile icon="people" tone="accent" value={stats.active} label="Résidents actifs" onPress={() => setTab('residents')} />
        <StatTile icon="ban" tone={stats.blocked + stats.expired ? 'danger' : 'grey'} value={stats.blocked} label="Badges bloqués" onPress={() => setTab('residents')} />
      </View>
      <View style={[s.grid, { marginTop: 10 }]}>
        <StatTile icon="swap-vertical" tone="success" value={stats.swipes} label="Passages" onPress={() => setTab('journal')} />
        <StatTile icon="close-circle" tone={stats.denied ? 'warning' : 'grey'} value={stats.denied} label="Refusés" onPress={() => setTab('journal')} />
      </View>

      {/* Quick actions */}
      <SectionTitle title="Actions rapides" />
      <View style={s.grid}>
        <QuickAction icon="person-add" label="Ajouter un résident" tone="accent"
          onPress={() => navigation.navigate('ResidentForm', { building })} />
        <QuickAction icon="scan" label="Identifier un badge" tone="purple" onPress={() => setIdentifyOpen(true)} />
      </View>

      {/* Recent activity */}
      <SectionTitle title="Activité récente" action="Tout voir" onAction={() => setTab('journal')} />
      <Card style={{ paddingVertical: 4 }}>
        {overview.recent.length === 0 ? (
          <EmptyState icon="time-outline" title="Aucune activité" subtitle="Les passages de badge apparaîtront ici en temps réel." />
        ) : overview.recent.map((item, i) => (
          <View key={item.id} style={i > 0 && s.divider}>
            <ActivityItem item={item} onPress={openResident} compact />
          </View>
        ))}
      </Card>

      <CaptureModal
        visible={identifyOpen}
        buildingId={building.id}
        mode="identify"
        onClose={() => setIdentifyOpen(false)}
        onOpenResident={r => { setIdentifyOpen(false); openResident(r.cardId); }}
        onAddUnknown={code => { setIdentifyOpen(false); navigation.navigate('ResidentForm', { building, cardCode: code }); }}
      />
    </ScrollView>
  );
}

function QuickAction({ icon, label, tone, onPress }) {
  const [fg, bg] = TONES[tone];
  return (
    <TouchableOpacity style={s.quick} onPress={onPress} activeOpacity={0.8}>
      <View style={[s.quickIcon, { backgroundColor: bg }]}><Ionicons name={icon} size={22} color={fg} /></View>
      <Text style={s.quickText}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  statusCard: { borderLeftWidth: 5 },
  statusTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  statusIcon: { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: 22, fontWeight: '800', marginTop: 2 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.successSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.pill, alignSelf: 'flex-start' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.success },
  liveText: { fontSize: 10, fontWeight: '800', color: C.success, letterSpacing: 0.5 },
  signals: { marginTop: 14, gap: 7, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.divider },
  signal: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  signalDot: { width: 7, height: 7, borderRadius: 4 },

  freeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  freeCardOn: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FCD34D' },
  freeIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  grid: { flexDirection: 'row', gap: 10 },
  quick: { flex: 1, backgroundColor: C.card, borderRadius: R.lg, padding: 14, alignItems: 'flex-start', borderWidth: 1, borderColor: C.border },
  quickIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  quickText: { ...T.h3, fontSize: 14 },
  divider: { borderTopWidth: 1, borderTopColor: C.divider },
});
