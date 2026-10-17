// Add / edit a resident: identity, badge (typed or read from the cabin
// reader), access type, home floor on an elevator-panel picker, validity.
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/api';
import { C, R, T, TONES } from '../src/theme';
import { addDays, dateShort } from '../src/format';
import { ACCESS_TYPES, RDC, computeFloors, floorLong, floorsSummary } from '../src/floors';
import { Header, Field, Card, Button, ChipSelect, useToast } from '../src/components/ui';
import FloorPanel from '../src/components/FloorPanel';
import CaptureModal from '../src/components/CaptureModal';

const VALIDITY = [
  { value: 'permanent', label: 'Permanent' },
  { value: 1, label: '1 jour' },
  { value: 7, label: '1 semaine' },
  { value: 30, label: '1 mois' },
  { value: 90, label: '3 mois' },
  { value: 365, label: '1 an' },
];

export default function ResidentFormScreen({ route, navigation }) {
  const { building, resident, cardCode: prefilledCode } = route.params;
  const editing = !!resident;
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [name, setName] = useState(resident?.name || '');
  const [apartment, setApartment] = useState(resident?.apartment || '');
  const [phone, setPhone] = useState(resident?.phone || '');
  const [cardCode, setCardCode] = useState(resident?.code || prefilledCode || '');
  const [accessType, setAccessType] = useState(resident?.accessType || 'RESIDENT');
  const [homeFloor, setHomeFloor] = useState(resident?.homeFloor ?? null);
  const [customFloors, setCustomFloors] = useState(resident?.customFloors?.length ? resident.customFloors : []);
  const [validity, setValidity] = useState(resident?.validUntil ? 'keep' : 'permanent');
  const [notes, setNotes] = useState(resident?.notes || '');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);

  const top = building.floorCount;
  const profile = { accessType, homeFloor, customFloors };
  const floors = useMemo(() => computeFloors(building, profile), [building, accessType, homeFloor, customFloors]); // eslint-disable-line react-hooks/exhaustive-deps

  const validityOptions = resident?.validUntil
    ? [{ value: 'keep', label: `Jusqu'au ${dateShort(resident.validUntil)}` }, ...VALIDITY]
    : VALIDITY;

  const onFloorPress = f => {
    if (accessType === 'RESIDENT') setHomeFloor(f);
    else if (accessType === 'CUSTOM' && f !== RDC) {
      setCustomFloors(cur => (cur.includes(f) ? cur.filter(x => x !== f) : [...cur, f].sort((a, b) => a - b)));
    }
    setErrors(e => ({ ...e, floor: null }));
  };

  const validate = () => {
    const e = {};
    if (name.trim().length < 2) e.name = 'Indiquez le nom du résident.';
    if (!/^[0-9]{1,10}$/.test(cardCode.trim())) e.cardCode = 'Code badge invalide : scannez le badge ou saisissez son numéro.';
    if (phone.trim() && !/^\+?[0-9 ]{7,20}$/.test(phone.trim())) e.phone = 'Numéro de téléphone invalide.';
    if (accessType === 'RESIDENT' && homeFloor == null) e.floor = "Touchez l'étage où habite le résident.";
    if (accessType === 'CUSTOM' && !customFloors.some(f => f !== RDC)) e.floor = 'Choisissez au moins un étage en plus du RDC.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    const body = {
      name: name.trim(),
      cardCode: cardCode.trim(),
      apartment: apartment.trim() || null,
      phone: phone.trim() || null,
      accessType,
      homeFloor: accessType === 'RESIDENT' ? homeFloor : null,
      customFloors: accessType === 'CUSTOM' ? customFloors : [],
      notes: notes.trim() || null,
    };
    if (validity === 'permanent') body.validUntil = null;
    else if (validity !== 'keep') body.validUntil = addDays(validity).toISOString();

    if (editing) {
      // Send only what changed, so the activity log records exactly that.
      const original = {
        name: resident.name, cardCode: resident.code, apartment: resident.apartment || null,
        phone: resident.phone || null, accessType: resident.accessType,
        homeFloor: resident.accessType === 'RESIDENT' ? resident.homeFloor : null,
        customFloors: resident.accessType === 'CUSTOM' ? resident.customFloors : [],
        notes: resident.notes || null, validUntil: resident.validUntil || null,
      };
      Object.keys(body).forEach(k => {
        if (JSON.stringify(body[k]) === JSON.stringify(original[k])) delete body[k];
      });
      if (Object.keys(body).length === 0) { navigation.goBack(); return; }
    }

    setSaving(true);
    try {
      if (editing) {
        await api(`/elevators/${building.id}/residents/${resident.cardId}`, { method: 'PATCH', body });
        toast.show('Résident mis à jour');
        navigation.goBack();
      } else {
        const created = await api(`/elevators/${building.id}/residents`, { method: 'POST', body });
        toast.show(`${created.name} ajouté · ${floorsSummary(created.floors)}`);
        navigation.replace('ResidentDetail', { buildingId: building.id, cardId: created.cardId });
      }
    } catch (e) {
      if (e.data?.code === 'CARD_IN_USE') setErrors(x => ({ ...x, cardCode: e.message }));
      else Alert.alert('Enregistrement impossible', e.message);
    } finally {
      setSaving(false);
    }
  };

  const typeMeta = ACCESS_TYPES[accessType];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header
        title={editing ? 'Modifier le résident' : 'Nouveau résident'}
        subtitle={building.name}
        onBack={() => navigation.goBack()}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
          {/* Identity */}
          <Text style={s.section}>Identité</Text>
          <Card>
            <Field label="Nom complet *" icon="person-outline" placeholder="Ex : Karim Benali" value={name}
              onChangeText={v => { setName(v); setErrors(e => ({ ...e, name: null })); }} error={errors.name} autoCapitalize="words" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field label="Appartement" icon="home-outline" placeholder="Ex : 12B" value={apartment} onChangeText={setApartment}
                style={{ flex: 1, marginBottom: 0 }} autoCapitalize="characters" maxLength={30} />
              <Field label="Téléphone" icon="call-outline" placeholder="06…" value={phone}
                onChangeText={v => { setPhone(v); setErrors(e => ({ ...e, phone: null })); }} keyboardType="phone-pad"
                style={{ flex: 1.3, marginBottom: 0 }} error={errors.phone} />
            </View>
          </Card>

          {/* Badge */}
          <Text style={s.section}>Badge</Text>
          <Card>
            <TouchableOpacity style={s.scanBtn} onPress={() => setCaptureOpen(true)} activeOpacity={0.85}>
              <View style={s.scanIcon}><Ionicons name="scan" size={24} color="#fff" /></View>
              <View style={{ flex: 1 }}>
                <Text style={[T.h3, { color: '#fff' }]}>{cardCode ? 'Scanner un autre badge' : 'Scanner le badge'}</Text>
                <Text style={s.scanSub}>Passez-le devant le lecteur de la cabine</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
            <View style={s.orRow}><View style={s.orLine} /><Text style={T.small}>ou saisir le code</Text><View style={s.orLine} /></View>
            <Field
              icon="card-outline" placeholder="Code du badge" value={cardCode} keyboardType="number-pad" maxLength={10}
              onChangeText={v => { setCardCode(v.replace(/[^0-9]/g, '')); setErrors(e => ({ ...e, cardCode: null })); }}
              error={errors.cardCode} inputStyle={T.mono} style={{ marginBottom: 0 }}
              hint={editing && cardCode !== resident.code ? "L'ancien badge sera désactivé immédiatement." : undefined}
            />
          </Card>

          {/* Access type */}
          <Text style={s.section}>Type d'accès</Text>
          <View style={s.types}>
            {Object.entries(ACCESS_TYPES).map(([key, t]) => {
              const active = key === accessType;
              const [fg, bg] = TONES[t.tone];
              return (
                <TouchableOpacity key={key} onPress={() => { setAccessType(key); setErrors(e => ({ ...e, floor: null })); }}
                  style={[s.type, active && { borderColor: fg, backgroundColor: bg }]} activeOpacity={0.8}>
                  <Ionicons name={t.icon} size={22} color={active ? fg : C.sub} />
                  <Text style={[s.typeText, active && { color: fg }]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[T.small, { marginTop: 8, lineHeight: 17 }]}>{typeMeta.description}</Text>

          {/* Floors */}
          <Text style={s.section}>
            {accessType === 'RESIDENT' ? "Étage d'habitation" : accessType === 'CUSTOM' ? 'Étages autorisés' : 'Étages'}
          </Text>
          <FloorPanel
            top={top}
            roofAccess={building.roofAccess}
            granted={floors}
            home={accessType === 'RESIDENT' ? homeFloor : null}
            mode={accessType === 'RESIDENT' ? 'home' : accessType === 'CUSTOM' ? 'multi' : 'readonly'}
            onPress={onFloorPress}
          />
          {errors.floor ? <Text style={s.error}>{errors.floor}</Text> : null}
          <View style={s.summary}>
            <Ionicons name="lock-open" size={18} color={C.success} />
            <Text style={[T.body, { flex: 1, lineHeight: 20 }]}>
              {accessType === 'RESIDENT' && homeFloor == null
                ? 'Touchez un étage pour choisir le domicile.'
                : <>Ce badge débloquera : <Text style={{ fontWeight: '800' }}>{floors.map(f => (f === RDC ? 'RDC' : floorLong(f))).join(', ')}</Text></>}
            </Text>
          </View>

          {/* Validity */}
          <Text style={s.section}>Validité du badge</Text>
          <Card>
            <ChipSelect options={validityOptions} value={validity} onChange={setValidity} />
            <Text style={[T.small, { marginTop: 10 }]}>
              {validity === 'permanent' ? "Le badge reste actif jusqu'à ce que vous le bloquiez."
                : validity === 'keep' ? `Expire le ${dateShort(resident.validUntil)}.`
                : `Le badge sera bloqué automatiquement le ${dateShort(addDays(validity))}. Idéal pour un locataire, un artisan ou un invité.`}
            </Text>
          </Card>

          {/* Notes */}
          <Text style={s.section}>Remarques</Text>
          <Card>
            <Field placeholder="Informations utiles (optionnel)" value={notes} onChangeText={setNotes} multiline
              inputStyle={{ minHeight: 70, textAlignVertical: 'top' }} style={{ marginBottom: 0 }} maxLength={500} />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button title={editing ? 'Enregistrer les modifications' : 'Ajouter le résident'} icon="checkmark" onPress={save} loading={saving} />
      </View>

      <CaptureModal
        visible={captureOpen}
        buildingId={building.id}
        mode="enroll"
        onCaptured={code => { setCardCode(code); setErrors(e => ({ ...e, cardCode: null })); }}
        onClose={() => setCaptureOpen(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  section: { ...T.label, marginTop: 22, marginBottom: 10 },
  scanBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.brand, borderRadius: R.md, padding: 14 },
  scanIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  scanSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 },
  orLine: { flex: 1, height: 1, backgroundColor: C.border },
  types: { flexDirection: 'row', gap: 8 },
  type: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: R.md, borderWidth: 2, borderColor: C.border, backgroundColor: C.card, gap: 6 },
  typeText: { fontSize: 13, fontWeight: '700', color: C.sub },
  error: { color: C.danger, fontWeight: '600', fontSize: 12, marginTop: 8 },
  summary: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: C.successSoft, padding: 13, borderRadius: R.md, marginTop: 12 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border },
});
