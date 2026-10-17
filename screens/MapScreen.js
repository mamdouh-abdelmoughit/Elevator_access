import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, Platform } from 'react-native';
import { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import FillMapView from '../components/FillMapView';
import * as SecureStore from 'expo-secure-store';
import { Linking } from 'react-native';

// Google Maps on Android; Apple Maps on iOS (Google Maps on iOS needs a custom
// native build — in Expo Go it renders an empty view).
const MAP_PROVIDER = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const INITIAL_REGION = {
  latitude: 31.7917,
  longitude: -7.0926,
  latitudeDelta: 5,
  longitudeDelta: 5,
};

// Elevator status → color (same palette as web dashboard)
const STATUS_COLOR = {
  IDLE:        '#22c55e',
  ACTIVE:      '#3b82f6',
  MAINTENANCE: '#f59e0b',
  ERROR:       '#ef4444',
  OFFLINE:     '#94a3b8',
};

function elevatorColor(status) {
  return STATUS_COLOR[status] || STATUS_COLOR.OFFLINE;
}

function techColor(isOnline, locationUpdatedAt) {
  if (!locationUpdatedAt) return '#94a3b8';
  const age = Date.now() - new Date(locationUpdatedAt).getTime();
  return (isOnline && age < 60000) ? '#22c55e' : '#94a3b8';
}

function initials(name) {
  const s = (name || '').trim();
  return s ? s[0].toUpperCase() : '?';
}

function DotMarker({ color }) {
  return <View style={[styles.markerDot, { backgroundColor: color }]} />;
}

function InitialMarker({ label, color }) {
  return (
    <View style={[styles.markerCircle, { backgroundColor: color }]}>
      <Text style={styles.markerText}>{label}</Text>
    </View>
  );
}

export default function MapScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [elevators, setElevators] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [loadError, setLoadError] = useState(null);
  // react-native-maps snapshots custom marker views once; if that happens before
  // the view has painted the marker renders blank ("half the pins"). Keep
  // tracking on briefly after each data change, then switch it off for perf.
  const [tracksChanges, setTracksChanges] = useState(true);

  const fetchData = async () => {
    try {
      const token = await SecureStore.getItemAsync('authToken');
      const [elevResp, userResp] = await Promise.all([
        fetch(`${API_URL}/elevators`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/users`,     { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (elevResp.ok) setElevators(await elevResp.json());
      if (userResp.ok) {
        const users = await userResp.json();
        setTechnicians(users.filter(u => u.role === 'EMPLOYEE' && u.latitude != null && u.longitude != null));
        setLoadError(null);
      } else {
        setLoadError(userResp.status === 403
          ? "Accès refusé — ce compte n'est pas administrateur."
          : `Erreur serveur (${userResp.status}).`);
      }
    } catch (e) {
      setLoadError('Connexion au serveur impossible.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setTracksChanges(true);
    const t = setTimeout(() => setTracksChanges(false), 2500);
    return () => clearTimeout(t);
  }, [elevators, technicians]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <FillMapView
        initialRegion={INITIAL_REGION}
        provider={MAP_PROVIDER}
        onPress={() => setSelectedItem(null)}
      >
        {elevators.filter(e => e.latitude && e.longitude).map(elev => (
          <Marker
            key={`elev-${elev.id}`}
            coordinate={{ latitude: elev.latitude, longitude: elev.longitude }}
            onPress={(e) => { e.stopPropagation(); setSelectedItem({ type: 'elev', data: elev }); }}
            tracksViewChanges={tracksChanges}
          >
            <DotMarker color={elevatorColor(elev.currentStatus)} />
          </Marker>
        ))}

        {technicians.map(tech => (
          <Marker
            key={`tech-${tech.id}`}
            coordinate={{ latitude: tech.latitude, longitude: tech.longitude }}
            onPress={(e) => { e.stopPropagation(); setSelectedItem({ type: 'tech', data: tech }); }}
            tracksViewChanges={tracksChanges}
          >
            <InitialMarker
              label={initials(tech.name)}
              color={techColor(tech.isOnline, tech.locationUpdatedAt)}
            />
          </Marker>
        ))}
      </FillMapView>

      {/* Elevator info card */}
      {selectedItem?.type === 'elev' && (
        <View style={styles.card}>
          <TouchableOpacity style={styles.cardClose} onPress={() => setSelectedItem(null)}>
            <Text style={styles.cardCloseText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.cardTitle}>🏢 {selectedItem.data.name}</Text>
          <Text style={styles.cardSub}>{selectedItem.data.location}</Text>
          <View style={[styles.statusBadge, { backgroundColor: elevatorColor(selectedItem.data.currentStatus) }]}>
            <Text style={styles.statusBadgeText}>{selectedItem.data.currentStatus || 'INCONNU'}</Text>
          </View>
          <TouchableOpacity style={styles.cardBtn}
            onPress={() => {
              setSelectedItem(null);
              navigation.navigate('ElevatorDetail', {
                elevatorId: selectedItem.data.id,
                elevatorName: selectedItem.data.name,
              });
            }}>
            <Text style={styles.cardBtnText}>Ouvrir les contrôles ➔</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Technician info card */}
      {selectedItem?.type === 'tech' && (
        <View style={styles.card}>
          <TouchableOpacity style={styles.cardClose} onPress={() => setSelectedItem(null)}>
            <Text style={styles.cardCloseText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.cardRow}>
            <View style={[styles.avatarCircle, { backgroundColor: techColor(selectedItem.data.isOnline, selectedItem.data.locationUpdatedAt) }]}>
              <Text style={styles.avatarText}>{initials(selectedItem.data.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{selectedItem.data.name}</Text>
              <Text style={styles.cardSub}>{selectedItem.data.phone}</Text>
              <Text style={[styles.onlineStatus, { color: selectedItem.data.isOnline ? '#22c55e' : '#94a3b8' }]}>
                {selectedItem.data.isOnline ? '● En ligne' : '● Hors ligne'}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={[styles.cardBtn, { backgroundColor: '#16a34a' }]}
            onPress={() => Linking.openURL(`tel:${selectedItem.data.phone}`)}>
            <Text style={styles.cardBtnText}>📞 Appeler</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Error / empty banner */}
      {loadError ? (
        <View style={[styles.banner, styles.bannerError]}>
          <Text style={styles.bannerText}>{loadError}</Text>
        </View>
      ) : (!loading && technicians.length === 0) ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Aucun technicien avec une position connue.</Text>
        </View>
      ) : null}

      {/* Legend */}
      <View style={styles.legend}>
        <Text style={styles.legendItem}>🟢 En ligne</Text>
        <Text style={styles.legendItem}>⚫ Hors ligne</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map:       { ...StyleSheet.absoluteFillObject },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },

  markerDot: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2.5, borderColor: 'white',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 4, elevation: 5,
  },
  markerCircle: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'white',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 5,
  },
  markerText: { color: 'white', fontWeight: '800', fontSize: 14 },

  card: {
    position: 'absolute', bottom: 80, left: 16, right: 16,
    backgroundColor: 'white', borderRadius: 14, padding: 16,
    elevation: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  cardClose:     { position: 'absolute', top: 10, right: 12, padding: 4 },
  cardCloseText: { fontSize: 16, color: '#94a3b8' },
  cardRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText:    { color: 'white', fontWeight: '800', fontSize: 18 },
  cardTitle:     { fontSize: 16, fontWeight: '700', paddingRight: 24 },
  cardSub:       { fontSize: 13, color: '#64748b', marginTop: 2 },
  onlineStatus:  { fontSize: 12, fontWeight: '600', marginTop: 4 },
  statusBadge:   { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, marginVertical: 8 },
  statusBadgeText: { color: 'white', fontSize: 12, fontWeight: '700' },
  cardBtn: {
    backgroundColor: '#1d4ed8', borderRadius: 8,
    paddingVertical: 10, alignItems: 'center', marginTop: 4,
  },
  cardBtnText: { color: 'white', fontWeight: '600', fontSize: 14 },

  legend: {
    position: 'absolute', bottom: 16, right: 16,
    backgroundColor: 'white', padding: 10, borderRadius: 8,
    elevation: 5, gap: 4,
  },
  legendItem: { fontSize: 12, color: '#334155' },

  banner: {
    position: 'absolute', top: 12, left: 16, right: 16,
    backgroundColor: 'rgba(30,41,59,0.92)', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 14, elevation: 6,
  },
  bannerError: { backgroundColor: 'rgba(185,28,28,0.94)' },
  bannerText: { color: 'white', fontSize: 13, textAlign: 'center', fontWeight: '600' },
});
