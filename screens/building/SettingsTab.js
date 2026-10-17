// Building configuration, reader health, requests to BioSwitch, account.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import appConfig from '../../app.json';
import { getSession, clearSession } from '../../src/api';
import { C, T } from '../../src/theme';
import { timeAgo } from '../../src/format';
import { floorLong } from '../../src/floors';
import { Card, InfoRow, SectionTitle, Button } from '../../src/components/ui';

export default function SettingsTab({ building, navigation }) {
  const [user, setUser] = useState(null);
  useEffect(() => { getSession().then(({ user }) => setUser(user)); }, []);

  const logout = () => Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Se déconnecter', style: 'destructive', onPress: async () => {
      await clearSession();
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } },
  ]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <SectionTitle title="Immeuble" style={{ marginTop: 6 }} />
      <Card style={{ paddingVertical: 4 }}>
        <InfoRow icon="business-outline" label="Nom" value={building.name} />
        <InfoRow icon="location-outline" label="Adresse" value={building.location} />
        <InfoRow icon="layers-outline" label="Étages" value={`RDC + ${building.floorCount}`} />
        <InfoRow icon="sunny-outline" label="Accès terrasse" value={building.roofAccess ? `Oui (${floorLong(building.floorCount)})` : 'Non'} />
        <InfoRow icon="timer-outline" label="Déverrouillage" value={`${building.unlockSeconds} secondes`} last />
      </Card>
      <Button
        title="Modifier la configuration"
        icon="create-outline"
        variant="secondary"
        style={{ marginTop: 10 }}
        onPress={() => navigation.navigate('BuildingSetup', { building, mode: 'edit' })}
      />

      <SectionTitle title="Lecteur de la cabine" />
      <Card style={{ paddingVertical: 4 }}>
        <InfoRow
          icon={building.online ? 'wifi' : 'cloud-offline-outline'}
          label="Connexion"
          value={building.online ? 'Connecté' : 'Hors ligne'}
          valueStyle={{ color: building.online ? C.success : C.danger }}
        />
        <InfoRow icon="pulse-outline" label="Dernier signal" value={timeAgo(building.lastHeartbeat)} />
        <InfoRow icon="lock-open-outline" label="Accès libre" value={building.freeAccess ? 'Activé' : 'Désactivé'} last />
      </Card>
      <Text style={[T.small, s.note]}>
        Le lecteur garde la liste des badges en mémoire : il continue de fonctionner même sans internet.
        Les modifications lui sont envoyées dès qu'il est de nouveau connecté.
      </Text>

      <SectionTitle title="Assistance BioSwitch" />
      <Card style={{ paddingVertical: 4 }}>
        <InfoRow icon="chatbubbles-outline" label="Mes demandes" value="Badges, problème…" onPress={() => navigation.navigate('Requests', { building })} last />
      </Card>

      <SectionTitle title="Compte" />
      <Card style={{ paddingVertical: 4 }}>
        <InfoRow icon="person-outline" label="Nom" value={user?.name || '—'} />
        <InfoRow icon="call-outline" label="Téléphone" value={user?.phone || '—'} last />
      </Card>
      <Button title="Se déconnecter" icon="log-out-outline" variant="danger" style={{ marginTop: 12 }} onPress={logout} />

      <Text style={[T.small, { textAlign: 'center', marginTop: 24, color: C.muted }]}>
        Espace Syndic · v{appConfig.expo.version}
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  note: { marginTop: 8, lineHeight: 18, paddingHorizontal: 4 },
});
