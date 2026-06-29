import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as SecureStore from 'expo-secure-store';
import { Linking } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const INITIAL_REGION = {
  latitude: 31.7917,
  longitude: -7.0926,
  latitudeDelta: 5,
  longitudeDelta: 5,
};

export default function MapScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [elevators, setElevators] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null); // { type: 'elev'|'tech', data: {...} }

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
        setTechnicians(users.filter(u => u.role === 'EMPLOYEE' && u.latitude && u.longitude));
      }
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={INITIAL_REGION}
        provider={PROVIDER_GOOGLE}
        onPress={() => setSelectedItem(null)}
      >
        {elevators.map(elev => (
          <Marker
            key={`elev-${elev.id}`}
            coordinate={{ latitude: elev.latitude, longitude: elev.longitude }}
            pinColor="blue"
            onPress={(e) => { e.stopPropagation(); setSelectedItem({ type: 'elev', data: elev }); }}
          />
        ))}

        {technicians.map(tech => (
          <Marker
            key={`tech-${tech.id}`}
            coordinate={{ latitude: tech.latitude, longitude: tech.longitude }}
            pinColor="green"
            onPress={(e) => { e.stopPropagation(); setSelectedItem({ type: 'tech', data: tech }); }}
          />
        ))}
      </MapView>

      {/* Floating info card — rendered OUTSIDE MapView so it's always on top */}
      {selectedItem?.type === 'elev' && (
        <View style={styles.card}>
          <TouchableOpacity style={styles.cardClose} onPress={() => setSelectedItem(null)}>
            <Text style={styles.cardCloseText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.cardTitle}>🏢 {selectedItem.data.name}</Text>
          <Text style={styles.cardSub}>{selectedItem.data.location}</Text>
          <Text style={styles.cardStatus}>{selectedItem.data.currentStatus || 'Inconnu'}</Text>
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

      {selectedItem?.type === 'tech' && (
        <View style={styles.card}>
          <TouchableOpacity style={styles.cardClose} onPress={() => setSelectedItem(null)}>
            <Text style={styles.cardCloseText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.cardTitle}>👷 {selectedItem.data.name}</Text>
          <Text style={styles.cardSub}>{selectedItem.data.phone}</Text>
          <TouchableOpacity style={[styles.cardBtn, { backgroundColor: '#16a34a' }]}
            onPress={() => Linking.openURL(`tel:${selectedItem.data.phone}`)}>
            <Text style={styles.cardBtnText}>📞 Appeler</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <Text style={{ color: 'blue',  fontWeight: 'bold' }}>● Ascenseurs ({elevators.length})</Text>
        <Text style={{ color: 'green', fontWeight: 'bold' }}>● Techniciens ({technicians.length})</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map:       { ...StyleSheet.absoluteFillObject },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },

  card: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    right: 16,
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 16,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  cardClose: {
    position: 'absolute',
    top: 10,
    right: 12,
    padding: 4,
  },
  cardCloseText: { fontSize: 16, color: '#94a3b8' },
  cardTitle:  { fontSize: 16, fontWeight: '700', marginBottom: 4, paddingRight: 24 },
  cardSub:    { fontSize: 13, color: '#64748b', marginBottom: 6 },
  cardStatus: { fontSize: 13, fontWeight: '600', color: '#1e40af', marginBottom: 12 },
  cardBtn: {
    backgroundColor: '#1d4ed8',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cardBtnText: { color: 'white', fontWeight: '600', fontSize: 14 },

  legend: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 8,
    elevation: 5,
    gap: 4,
  },
});
