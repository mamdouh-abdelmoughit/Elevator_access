// Requests from the Syndic to BioSwitch (blank badges to order, a problem to
// report…). Residents themselves are managed directly in the app now.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Modal, TouchableOpacity, RefreshControl, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/api';
import { C, R, T, TONES } from '../src/theme';
import { dateTime } from '../src/format';
import { Header, Card, Pill, Button, Field, EmptyState, useToast } from '../src/components/ui';

const TYPES = {
  NEW_CARD: { label: 'Commande de badges', icon: 'card', tone: 'accent', placeholder: 'Ex : 10 badges vierges' },
  SUPPORT:  { label: 'Signaler un problème', icon: 'construct', tone: 'warning', placeholder: 'Ex : le lecteur ne réagit plus' },
  OTHER:    { label: 'Autre demande', icon: 'chatbubble-ellipses', tone: 'purple', placeholder: 'Objet de la demande' },
};
const STATUS = {
  PENDING:   { label: 'En attente', tone: 'warning' },
  COMPLETED: { label: 'Traitée', tone: 'success' },
  REJECTED:  { label: 'Refusée', tone: 'danger' },
};

export default function RequestsScreen({ route, navigation }) {
  const { building } = route.params;
  const toast = useToast();
  const [requests, setRequests] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('NEW_CARD');
  const [subject, setSubject] = useState('');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await api('/requests/my');
      setRequests(all.filter(r => r.elevatorId === building.id));
    } catch (e) {
      toast.show(e.message, 'danger');
      setRequests(r => r || []);
    } finally { setRefreshing(false); }
  }, [building.id, toast]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (subject.trim().length < 2) return;
    setSending(true);
    try {
      await api('/requests', { method: 'POST', body: { elevatorId: building.id, type, residentName: subject.trim(), notes: notes.trim() } });
      toast.show('Demande envoyée à BioSwitch');
      setOpen(false); setSubject(''); setNotes('');
      load();
    } catch (e) {
      toast.show(e.message, 'danger');
    } finally { setSending(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="Mes demandes" subtitle={building.name} onBack={() => navigation.goBack()} />
      <FlatList
        data={requests || []}
        keyExtractor={r => String(r.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[C.brand]} />}
        ListEmptyComponent={requests ? (
          <EmptyState icon="chatbubbles-outline" title="Aucune demande" subtitle="Commandez des badges ou signalez un problème à l'équipe BioSwitch." />
        ) : null}
        renderItem={({ item }) => {
          const t = TYPES[item.type] || { label: item.type, icon: 'document', tone: 'grey' };
          const st = STATUS[item.status] || { label: item.status, tone: 'grey' };
          const [fg, bg] = TONES[t.tone];
          return (
            <Card style={s.req}>
              <View style={[s.reqIcon, { backgroundColor: bg }]}><Ionicons name={t.icon} size={18} color={fg} /></View>
              <View style={{ flex: 1 }}>
                <View style={s.reqTop}>
                  <Text style={T.small}>{t.label}</Text>
                  <Pill label={st.label} tone={st.tone} dot />
                </View>
                <Text style={[T.h3, { marginTop: 3 }]}>{item.residentName}</Text>
                {item.notes ? <Text style={[T.sub, { marginTop: 4 }]}>{item.notes}</Text> : null}
                <Text style={[T.small, { marginTop: 6, color: C.muted }]}>{dateTime(item.createdAt)}</Text>
              </View>
            </Card>
          );
        }}
      />
      <View style={s.fabWrap}>
        <Button title="Nouvelle demande" icon="add" onPress={() => setOpen(true)} />
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={T.h2}>Nouvelle demande</Text>
            <Text style={[T.sub, { marginTop: 4, marginBottom: 16 }]}>Elle sera traitée par l'équipe BioSwitch.</Text>
            {Object.entries(TYPES).map(([key, t]) => {
              const active = key === type;
              const [fg, bg] = TONES[t.tone];
              return (
                <TouchableOpacity key={key} onPress={() => setType(key)} style={[s.typeRow, active && { borderColor: fg, backgroundColor: bg }]}>
                  <Ionicons name={t.icon} size={18} color={active ? fg : C.sub} />
                  <Text style={[T.body, { flex: 1, fontWeight: active ? '800' : '500', color: active ? fg : C.text }]}>{t.label}</Text>
                  {active ? <Ionicons name="checkmark-circle" size={20} color={fg} /> : null}
                </TouchableOpacity>
              );
            })}
            <Field label="Objet *" placeholder={TYPES[type].placeholder} value={subject} onChangeText={setSubject} style={{ marginTop: 10 }} />
            <Field label="Détails" placeholder="Informations complémentaires…" value={notes} onChangeText={setNotes} multiline
              inputStyle={{ minHeight: 70, textAlignVertical: 'top' }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Annuler" variant="secondary" onPress={() => setOpen(false)} style={{ flex: 1 }} />
              <Button title="Envoyer" icon="send" onPress={submit} loading={sending} disabled={subject.trim().length < 2} style={{ flex: 2 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  req: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  reqIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  reqTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fabWrap: { position: 'absolute', left: 16, right: 16, bottom: 24 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 34 },
  handle: { width: 42, height: 5, borderRadius: 3, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: R.md, borderWidth: 1.5, borderColor: C.border, marginBottom: 8 },
});
