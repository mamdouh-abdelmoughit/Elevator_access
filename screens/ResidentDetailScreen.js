// One resident: access on the cabin panel, badge & contact info, actions
// (block, replace badge, edit, delete) and their recent swipes.
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, Linking, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/api';
import { C, R, T } from '../src/theme';
import { dateShort, dateTime, timeAgo, dayLabel, time } from '../src/format';
import { ACCESS_TYPES, floorLong } from '../src/floors';
import { Header, Card, Avatar, Pill, InfoRow, SectionTitle, Button, EmptyState, IconButton, useToast } from '../src/components/ui';
import FloorPanel from '../src/components/FloorPanel';

const DENY = { BLOCKED: 'badge bloqué', EXPIRED: 'badge expiré', DEVICE_OUT_OF_SYNC: 'lecteur non synchronisé' };

export default function ResidentDetailScreen({ route, navigation }) {
  const { buildingId, cardId } = route.params;
  const toast = useToast();
  const [resident, setResident] = useState(null);
  const [building, setBuilding] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, o] = await Promise.all([
        api(`/elevators/${buildingId}/residents/${cardId}`),
        api(`/elevators/${buildingId}/overview`),
      ]);
      setResident(r); setBuilding(o.elevator); setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, [buildingId, cardId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!resident || !building) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title="Résident" onBack={() => navigation.goBack()} />
        {error
          ? <EmptyState icon="alert-circle-outline" title="Chargement impossible" subtitle={error} action="Réessayer" onAction={load} />
          : <ActivityIndicator style={{ marginTop: 40 }} color={C.brand} />}
      </View>
    );
  }

  const status = resident.expired ? 'expired' : resident.isActive ? 'active' : 'blocked';
  const type = ACCESS_TYPES[resident.accessType] || ACCESS_TYPES.RESIDENT;

  const toggleBlock = () => {
    const block = resident.isActive;
    Alert.alert(
      block ? 'Bloquer ce badge ?' : 'Rétablir l’accès ?',
      block
        ? `${resident.name} ne pourra plus utiliser l'ascenseur avec son badge. Vous pourrez le débloquer à tout moment.`
        : `${resident.name} pourra de nouveau utiliser l'ascenseur.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: block ? 'Bloquer' : 'Débloquer', style: block ? 'destructive' : 'default',
          onPress: async () => {
            setBusy(true);
            try {
              await api(`/elevators/${buildingId}/access-control`, { method: 'POST', body: { cardId: resident.cardId, action: block ? 'BLOCK' : 'UNBLOCK' } });
              toast.show(block ? 'Badge bloqué' : 'Accès rétabli', block ? 'warning' : 'success');
              await load();
            } catch (e) {
              Alert.alert('Action impossible', e.message);
            } finally { setBusy(false); }
          },
        },
      ],
    );
  };

  const remove = () => Alert.alert(
    'Supprimer ce résident ?',
    `${resident.name} et son badge seront supprimés définitivement. L'historique des passages est conservé.`,
    [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api(`/elevators/${buildingId}/residents/${resident.cardId}`, { method: 'DELETE' });
            toast.show('Résident supprimé');
            navigation.goBack();
          } catch (e) {
            Alert.alert('Suppression impossible', e.message);
            setBusy(false);
          }
        },
      },
    ],
  );

  const edit = () => navigation.navigate('ResidentForm', { building, resident });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header
        title={resident.name}
        subtitle={building.name}
        onBack={() => navigation.goBack()}
        right={<IconButton icon="create-outline" onPress={edit} color={C.brand} bg={C.brandSoft} />}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[C.brand]} />}
      >
        {/* Hero */}
        <Card style={s.hero}>
          <Avatar name={resident.name} size={64} tone={status === 'active' ? type.tone : status === 'expired' ? 'warning' : 'danger'} />
          <View style={{ flex: 1 }}>
            <Text style={T.h2} numberOfLines={2}>{resident.name}</Text>
            <Text style={[T.sub, { marginTop: 2 }]}>
              {[resident.apartment && `Apt ${resident.apartment}`, resident.homeFloor != null && resident.accessType === 'RESIDENT' && floorLong(resident.homeFloor)].filter(Boolean).join(' · ') || type.label}
            </Text>
            <View style={s.pills}>
              <Pill label={type.label} tone={type.tone} icon={type.icon} />
              {status === 'active' && <Pill label="Actif" tone="success" dot />}
              {status === 'blocked' && <Pill label="Bloqué" tone="danger" dot />}
              {status === 'expired' && <Pill label="Expiré" tone="warning" dot />}
            </View>
          </View>
        </Card>

        {status !== 'active' ? (
          <View style={[s.banner, status === 'expired' ? s.bannerWarn : s.bannerDanger]}>
            <Ionicons name={status === 'expired' ? 'time' : 'ban'} size={18} color={status === 'expired' ? C.warning : C.danger} />
            <Text style={[s.bannerText, { color: status === 'expired' ? C.warning : C.danger }]}>
              {status === 'expired'
                ? `Badge expiré le ${dateShort(resident.validUntil)}. Modifiez sa validité pour le réactiver.`
                : "Ce badge est bloqué : aucun bouton ne s'active à son passage."}
            </Text>
          </View>
        ) : null}

        {/* Actions */}
        <View style={s.actions}>
          {status !== 'expired' ? (
            <Button
              title={resident.isActive ? 'Bloquer' : 'Débloquer'}
              icon={resident.isActive ? 'ban' : 'checkmark-circle'}
              variant={resident.isActive ? 'danger' : 'success'}
              onPress={toggleBlock} loading={busy} style={{ flex: 1 }} small
            />
          ) : (
            <Button title="Prolonger" icon="calendar" variant="success" onPress={edit} style={{ flex: 1 }} small />
          )}
          <Button title="Remplacer le badge" icon="card" variant="secondary" onPress={edit} style={{ flex: 1.4 }} small />
        </View>

        {/* Access */}
        <SectionTitle title="Accès dans la cabine" />
        <FloorPanel
          top={building.floorCount}
          roofAccess={building.roofAccess}
          granted={resident.isActive && !resident.expired ? resident.floors : []}
          home={resident.accessType === 'RESIDENT' ? resident.homeFloor : null}
          mode="readonly"
        />
        <Text style={[T.small, { marginTop: 8, lineHeight: 17 }]}>
          Au passage du badge, ces boutons s'activent pendant {building.unlockSeconds} secondes.
        </Text>

        {/* Info */}
        <SectionTitle title="Informations" />
        <Card style={{ paddingVertical: 4 }}>
          <InfoRow icon="card-outline" label="Code badge" value={resident.code} valueStyle={T.mono} />
          {resident.phone ? (
            <InfoRow icon="call-outline" label="Téléphone" value={resident.phone} onPress={() => Linking.openURL(`tel:${resident.phone.replace(/\s/g, '')}`)} />
          ) : null}
          <InfoRow icon="calendar-outline" label="Validité" value={resident.validUntil ? `Jusqu'au ${dateShort(resident.validUntil)}` : 'Permanent'} />
          <InfoRow icon="footsteps-outline" label="Dernier passage" value={resident.lastSeen ? timeAgo(resident.lastSeen) : 'Jamais'} />
          <InfoRow icon="add-circle-outline" label="Ajouté le" value={dateShort(resident.createdAt)} last={!resident.notes} />
          {resident.notes ? <InfoRow icon="document-text-outline" label="Remarques" value={resident.notes} last /> : null}
        </Card>

        {/* History */}
        <SectionTitle title="Derniers passages" />
        <Card style={{ paddingVertical: 4 }}>
          {resident.history.length === 0 ? (
            <EmptyState icon="footsteps-outline" title="Aucun passage" subtitle="Les utilisations de ce badge apparaîtront ici." />
          ) : resident.history.map((h, i) => {
            const ok = h.status === 'GRANTED';
            return (
              <View key={h.id} style={[s.hist, i > 0 && s.histBorder]}>
                <View style={[s.histIcon, { backgroundColor: ok ? C.successSoft : C.dangerSoft }]}>
                  <Ionicons name={ok ? 'lock-open' : 'close'} size={15} color={ok ? C.success : C.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={T.body}>{ok ? 'Accès autorisé' : `Refusé${DENY[h.reason] ? ` · ${DENY[h.reason]}` : ''}`}</Text>
                  <Text style={T.small}>{dayLabel(h.timestamp)} à {time(h.timestamp)}</Text>
                </View>
              </View>
            );
          })}
        </Card>

        <Button title="Supprimer le résident" icon="trash-outline" variant="danger" onPress={remove}
          style={{ marginTop: 20 }} />
        <Text style={[T.small, { textAlign: 'center', color: C.muted, marginTop: 10 }]}>Dernière modification {dateTime(resident.updatedAt)}</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pills: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  banner: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 13, borderRadius: R.md, marginTop: 12 },
  bannerWarn: { backgroundColor: C.warningSoft },
  bannerDanger: { backgroundColor: C.dangerSoft },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  hist: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  histBorder: { borderTopWidth: 1, borderTopColor: C.divider },
  histIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
