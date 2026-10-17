// One line of the activity log (swipe, elevator state change, or syndic action).
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, TONES, T } from '../theme';
import { time } from '../format';
import { floorsSummary } from '../floors';
import { parseStatus, STATUS_META } from '../status';

const DENY_REASONS = {
  UNKNOWN_CARD: 'Badge non enregistré',
  BLOCKED: 'Badge bloqué',
  EXPIRED: 'Badge expiré',
  NO_PERMISSION: "Pas d'accès à cet ascenseur",
  DEVICE_OUT_OF_SYNC: 'Lecteur en cours de synchronisation',
};

const AUDIT = {
  BUILDING_CONFIGURED: { title: 'Immeuble configuré',   icon: 'business',        tone: 'brand' },
  SETTINGS_UPDATED:    { title: 'Réglages modifiés',    icon: 'settings',        tone: 'brand' },
  RESIDENT_CREATED:    { title: 'Résident ajouté',      icon: 'person-add',      tone: 'accent' },
  RESIDENT_UPDATED:    { title: 'Résident modifié',     icon: 'create',          tone: 'accent' },
  CARD_REPLACED:       { title: 'Badge remplacé',       icon: 'card',            tone: 'accent' },
  RESIDENT_BLOCKED:    { title: 'Accès bloqué',         icon: 'ban',             tone: 'danger' },
  RESIDENT_UNBLOCKED:  { title: 'Accès rétabli',        icon: 'checkmark-done',  tone: 'success' },
  RESIDENT_DELETED:    { title: 'Résident supprimé',    icon: 'trash',           tone: 'danger' },
  RESIDENT_EXPIRED:    { title: 'Badge arrivé à expiration', icon: 'time',       tone: 'warning' },
};

const COMMANDS = {
  FREE_ACCESS_ON:  { title: 'Accès libre activé',    icon: 'lock-open', tone: 'warning' },
  FREE_ACCESS_OFF: { title: 'Accès libre désactivé', icon: 'lock-closed', tone: 'success' },
};

export function describeActivity(item) {
  const d = item.details || {};
  if (item.eventType === 'ACCESS_ATTEMPT') {
    const granted = d.status === 'GRANTED';
    const who = d.residentName || (granted ? `Badge ${d.cardCode}` : 'Badge inconnu');
    const tags = [];
    if (d.freeAccess) tags.push('accès libre');
    if (d.delayed) tags.push('reçu en différé');
    if (d.outOfSync) tags.push('lecteur à resynchroniser');
    return {
      icon: granted ? 'lock-open' : 'close-circle',
      tone: granted ? 'success' : 'danger',
      title: who,
      subtitle: granted
        ? `${d.apartment ? `Apt ${d.apartment} · ` : ''}Débloqué : ${floorsSummary(d.floors)}`
        : `${DENY_REASONS[d.reason] || 'Accès refusé'}${d.residentName ? '' : ` · ${d.cardCode}`}`,
      tags,
      cardId: d.cardId || null,
    };
  }
  if (item.eventType === 'STATE_CHANGE') {
    const st = parseStatus(d.status);
    const meta = STATUS_META[st.kind];
    return {
      icon: meta.icon,
      tone: meta.tone,
      title: `Ascenseur : ${meta.title.toLowerCase()}`,
      subtitle: st.lines.join(' · ') || (d.status === 'IDLE' ? 'Aucun signal actif' : d.status),
      tags: [],
    };
  }
  if (item.eventType === 'AUDIT') {
    const meta = d.action === 'COMMAND_SENT'
      ? (COMMANDS[d.command] || { title: `Commande ${d.command}`, icon: 'flash', tone: 'grey' })
      : (AUDIT[d.action] || { title: d.action, icon: 'information-circle', tone: 'grey' });
    const parts = [];
    if (d.residentName) parts.push(d.residentName);
    if (d.action === 'SETTINGS_UPDATED' || d.action === 'BUILDING_CONFIGURED') {
      const a = d.after || {};
      parts.push(`RDC + ${a.floorCount} étages · ${a.unlockSeconds}s${a.roofAccess ? ' · terrasse' : ''}`);
    }
    if (d.floors && d.action !== 'RESIDENT_DELETED') parts.push(floorsSummary(d.floors));
    if (d.actorName) parts.push(`par ${d.actorName}`);
    return { ...meta, subtitle: parts.join(' · '), tags: [], cardId: d.action !== 'RESIDENT_DELETED' ? d.cardId : null };
  }
  return { icon: 'ellipse', tone: 'grey', title: item.eventType, subtitle: '', tags: [] };
}

export default function ActivityItem({ item, onPress, compact }) {
  const a = describeActivity(item);
  const [fg, bg] = TONES[a.tone];
  const Comp = onPress && a.cardId ? TouchableOpacity : View;
  return (
    <Comp onPress={() => onPress(a.cardId)} style={[s.row, compact && { paddingVertical: 9 }]} activeOpacity={0.7}>
      <View style={[s.icon, { backgroundColor: bg }]}><Ionicons name={a.icon} size={17} color={fg} /></View>
      <View style={{ flex: 1 }}>
        <Text style={T.h3} numberOfLines={1}>{a.title}</Text>
        {a.subtitle ? <Text style={[T.small, { marginTop: 2 }]} numberOfLines={2}>{a.subtitle}</Text> : null}
        {a.tags.length ? (
          <View style={s.tags}>
            {a.tags.map(t => <Text key={t} style={s.tag}>{t}</Text>)}
          </View>
        ) : null}
      </View>
      <Text style={s.time}>{time(item.timestamp)}</Text>
    </Comp>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  time: { fontSize: 12, color: C.muted, fontWeight: '600', marginTop: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  tag: { fontSize: 10, fontWeight: '700', color: C.warning, backgroundColor: C.warningSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, overflow: 'hidden' },
});
