// First-time configuration of a building (and later edits): number of floors,
// shared top floor (terrasse), and how long buttons stay unlocked after a swipe.
import React, { useState } from 'react';
import { View, Text, ScrollView, Switch, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/api';
import { C, R, T } from '../src/theme';
import { Card, Button, Header, ChipSelect, useToast } from '../src/components/ui';
import { MAX_FLOOR_COUNT, computeFloors, floorsSummary, floorLong } from '../src/floors';

const UNLOCK_OPTIONS = [5, 10, 15, 20, 30];

export default function BuildingSetupScreen({ route, navigation }) {
  const { building, mode = 'setup' } = route.params;
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const isSetup = mode === 'setup';

  const [floors, setFloors] = useState(building.floorCount ?? 5);
  const [roofAccess, setRoofAccess] = useState(building.roofAccess ?? true);
  const [unlockSeconds, setUnlockSeconds] = useState(building.unlockSeconds ?? 10);
  const [saving, setSaving] = useState(false);

  const exampleFloor = Math.min(2, floors);
  const example = computeFloors({ floorCount: floors, roofAccess }, { accessType: 'RESIDENT', homeFloor: exampleFloor });

  const save = async () => {
    const doSave = async () => {
      setSaving(true);
      try {
        await api(`/elevators/${building.id}/settings`, {
          method: 'PATCH',
          body: { floorCount: floors, roofAccess, unlockSeconds },
        });
        toast.show(isSetup ? 'Immeuble configuré' : 'Réglages enregistrés');
        if (isSetup) navigation.replace('Building', { buildingId: building.id });
        else navigation.goBack();
      } catch (e) {
        const names = e.data?.residents?.slice(0, 5).join(', ');
        Alert.alert('Enregistrement impossible', names ? `${e.message}\n\n${names}` : e.message);
      } finally {
        setSaving(false);
      }
    };
    if (!isSetup && (floors !== building.floorCount || roofAccess !== building.roofAccess)) {
      Alert.alert(
        'Confirmer les changements',
        "Les accès de tous les résidents seront recalculés et envoyés à l'ascenseur.",
        [{ text: 'Annuler', style: 'cancel' }, { text: 'Confirmer', onPress: doSave }],
      );
    } else doSave();
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header
        title={isSetup ? 'Configurer l’immeuble' : 'Configuration'}
        subtitle={building.name}
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {isSetup ? (
          <View style={s.intro}>
            <Ionicons name="sparkles" size={20} color={C.accent} />
            <Text style={[T.sub, { flex: 1, color: C.text }]}>
              Avant d'ajouter des résidents, indiquez la configuration de l'immeuble. Vous pourrez la modifier plus tard.
            </Text>
          </View>
        ) : null}

        {/* Floors */}
        <Text style={s.step}>1 · Nombre d'étages</Text>
        <Card>
          <View style={s.floorsRow}>
            <BuildingDrawing floors={floors} roof={roofAccess} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <View style={s.stepper}>
                <TouchableOpacity style={s.stepBtn} onPress={() => setFloors(f => Math.max(1, f - 1))} disabled={floors <= 1}>
                  <Ionicons name="remove" size={26} color={floors <= 1 ? C.muted : C.brand} />
                </TouchableOpacity>
                <Text style={s.floorsValue}>{floors}</Text>
                <TouchableOpacity style={s.stepBtn} onPress={() => setFloors(f => Math.min(MAX_FLOOR_COUNT, f + 1))} disabled={floors >= MAX_FLOOR_COUNT}>
                  <Ionicons name="add" size={26} color={floors >= MAX_FLOOR_COUNT ? C.muted : C.brand} />
                </TouchableOpacity>
              </View>
              <Text style={[T.h3, { marginTop: 8 }]}>RDC + {floors} étage{floors > 1 ? 's' : ''}</Text>
              <Text style={[T.small, { marginTop: 4, textAlign: 'center' }]}>
                {floors + 1} boutons dans la cabine{'\n'}(maximum {MAX_FLOOR_COUNT} étages)
              </Text>
            </View>
          </View>
        </Card>

        {/* Roof */}
        <Text style={s.step}>2 · Dernier étage partagé</Text>
        <Card>
          <View style={s.switchRow}>
            <View style={s.switchIcon}><Ionicons name="sunny" size={20} color={C.warning} /></View>
            <View style={{ flex: 1 }}>
              <Text style={T.h3}>Accès terrasse pour tous</Text>
              <Text style={[T.small, { marginTop: 3, lineHeight: 17 }]}>
                Chaque résident pourra aussi aller au {floorLong(floors)} (terrasse, toit, buanderie…).
              </Text>
            </View>
            <Switch
              value={roofAccess}
              onValueChange={setRoofAccess}
              trackColor={{ true: C.accent, false: C.border }}
              thumbColor="#fff"
            />
          </View>
        </Card>

        {/* Unlock duration */}
        <Text style={s.step}>3 · Durée de déverrouillage</Text>
        <Card>
          <Text style={[T.sub, { marginBottom: 12, lineHeight: 19 }]}>
            Après le passage du badge, les boutons autorisés restent actifs pendant :
          </Text>
          <ChipSelect
            options={UNLOCK_OPTIONS.map(v => ({ value: v, label: `${v} s` }))}
            value={unlockSeconds}
            onChange={setUnlockSeconds}
          />
        </Card>

        {/* Preview */}
        <Card style={s.preview}>
          <Ionicons name="information-circle" size={20} color={C.accent} />
          <Text style={[T.sub, { flex: 1, color: C.text, lineHeight: 20 }]}>
            Exemple : un résident du <Text style={{ fontWeight: '800' }}>{floorLong(exampleFloor)}</Text> passe son badge.
            Les boutons <Text style={{ fontWeight: '800' }}>{floorsSummary(example)}</Text> s'activent pendant {unlockSeconds} secondes,
            les autres restent bloqués.
          </Text>
        </Card>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button title={isSetup ? "Enregistrer et continuer" : 'Enregistrer'} icon="checkmark" onPress={save} loading={saving} />
      </View>
    </View>
  );
}

// A tiny building that grows with the floor count.
function BuildingDrawing({ floors, roof }) {
  const levels = [];
  for (let f = floors; f >= 0; f--) levels.push(f);
  const h = Math.max(8, Math.min(16, 150 / (floors + 1)));
  return (
    <View style={s.drawing}>
      <View style={[s.roof, roof && { backgroundColor: C.warning }]} />
      {levels.map(f => (
        <View key={f} style={[s.level, { height: h }, f === 0 && s.levelRdc]}>
          {f === 0 ? <View style={s.door} /> : (
            <>
              <View style={s.window} /><View style={s.window} /><View style={s.window} />
            </>
          )}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  intro: { flexDirection: 'row', gap: 10, backgroundColor: C.accentSoft, padding: 14, borderRadius: R.md, marginBottom: 4 },
  step: { ...T.label, marginTop: 22, marginBottom: 10 },
  floorsRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  floorsValue: { fontSize: 44, fontWeight: '800', color: C.brand, minWidth: 64, textAlign: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.warningSoft, alignItems: 'center', justifyContent: 'center' },
  preview: { flexDirection: 'row', gap: 10, marginTop: 22, backgroundColor: '#F8FAFF', borderWidth: 1, borderColor: C.accentSoft },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border },

  drawing: { width: 74, alignItems: 'center' },
  roof: { width: 64, height: 6, borderRadius: 3, backgroundColor: C.border, marginBottom: 2 },
  level: { width: 58, backgroundColor: C.brand, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.brandDark },
  levelRdc: { backgroundColor: C.brandDark, alignItems: 'flex-end' },
  window: { width: 9, height: '55%', backgroundColor: '#93C5FD', borderRadius: 1 },
  door: { width: 12, height: '80%', backgroundColor: '#FCD34D', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
});
