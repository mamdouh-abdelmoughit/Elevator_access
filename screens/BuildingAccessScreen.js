import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Alert,
  TextInput, Button, TouchableOpacity, ActivityIndicator, ScrollView,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const floorLabel = f => (f === 0 ? 'RDC' : String(f));

async function call(path, method = 'GET', body) {
  const token = await SecureStore.getItemAsync('authToken');
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

// Admin view of a building's residents (cabin-reader elevators). Residents
// get RDC + their floor (+ top floor if the building shares it) — computed by
// the backend; the Syndic manages the same list from the Syndic app.
export default function BuildingAccessScreen({ route }) {
  const { elevatorId, elevatorName } = route.params;
  const [building, setBuilding] = useState(null);
  const [residents, setResidents] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newFloor, setNewFloor] = useState(null);
  const [adding, setAdding] = useState(false);
  const [floorInput, setFloorInput] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [o, list] = await Promise.all([
        call(`/elevators/${elevatorId}/overview`),
        call(`/elevators/${elevatorId}/residents`),
      ]);
      setBuilding(o.elevator);
      setResidents(list);
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  }, [elevatorId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const configureFloors = async () => {
    const n = parseInt(floorInput, 10);
    if (isNaN(n)) return;
    try {
      await call(`/elevators/${elevatorId}/settings`, 'PATCH', { floorCount: n });
      setFloorInput('');
      fetchAll();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const handleToggleStatus = (r) => {
    const action = r.isActive ? "BLOCK" : "UNBLOCK";
    Alert.alert(
      `${r.isActive ? 'Block' : 'Unblock'} access?`,
      `${r.name} (${r.code})`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: r.isActive ? 'Block' : 'Unblock',
          style: r.isActive ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await call(`/elevators/${elevatorId}/access-control`, 'POST', { cardId: r.cardId, action });
              fetchAll();
            } catch (e) {
              Alert.alert("Error", e.message);
            }
          }
        }
      ]
    );
  };

  const handleAddCard = async () => {
    if (!newCode || !newLabel || newFloor === null) {
      Alert.alert("Missing Info", "Enter card code, resident name and floor.");
      return;
    }
    setAdding(true);
    try {
      const created = await call(`/elevators/${elevatorId}/residents`, 'POST', {
        name: newLabel, cardCode: newCode, homeFloor: newFloor,
      });
      Alert.alert("Success", `Access granted: ${created.floors.map(floorLabel).join(', ')}`);
      setNewCode(''); setNewLabel(''); setNewFloor(null);
      fetchAll();
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setAdding(false);
    }
  };

  const renderItem = ({ item }) => {
    const active = item.isActive && !item.expired;
    return (
      <View style={[styles.cardRow, { opacity: active ? 1 : 0.6, borderColor: active ? 'transparent' : 'red', borderWidth: active ? 0 : 1 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.residentName}>{active ? "🟢" : "🔴"} {item.name || "Unknown"}</Text>
          <Text style={styles.cardCode}>Code: {item.code}{item.apartment ? ` · Apt ${item.apartment}` : ''}</Text>
          <Text style={styles.floors}>Floors: {item.floors.map(floorLabel).join(' · ')}</Text>
          {item.expired && <Text style={styles.flag}>EXPIRED</Text>}
          {!item.isActive && !item.expired && <Text style={styles.flag}>ACCESS BLOCKED</Text>}
        </View>
        <Button
          title={item.isActive ? "Block" : "Unblock"}
          color={item.isActive ? "red" : "green"}
          onPress={() => handleToggleStatus(item)}
        />
      </View>
    );
  };

  const notConfigured = building && building.floorCount == null;
  const floors = building?.floorCount != null ? Array.from({ length: building.floorCount + 1 }, (_, i) => i) : [];

  const listHeader = (
    <View>
      <Text style={styles.header}>Manage Access: {elevatorName}</Text>
      {notConfigured ? (
        <View style={styles.addSection}>
          <Text style={styles.subHeader}>Building not configured</Text>
          <Text style={{ color: 'gray', marginBottom: 10 }}>
            Set the number of floors (or let the Syndic do it from the Syndic app).
          </Text>
          <TextInput style={styles.input} placeholder="Number of floors (1-16)" keyboardType="numeric"
            value={floorInput} onChangeText={setFloorInput} />
          <Button title="Save" onPress={configureFloors} />
        </View>
      ) : building ? (
        <View style={styles.addSection}>
          <Text style={styles.subHeader}>Add New Resident</Text>
          <TextInput style={styles.input} placeholder="Card Code (e.g. 12345)" value={newCode}
            onChangeText={setNewCode} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Resident Name (e.g. Mr. Alami)" value={newLabel}
            onChangeText={setNewLabel} />
          <Text style={{ fontWeight: 'bold', marginBottom: 6 }}>Home floor</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            {floors.map(f => (
              <TouchableOpacity key={f} onPress={() => setNewFloor(f)}
                style={[styles.floorBtn, newFloor === f && styles.floorBtnActive]}>
                <Text style={{ color: newFloor === f ? 'white' : '#023c69', fontWeight: 'bold' }}>{floorLabel(f)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={{ color: 'gray', fontSize: 12, marginBottom: 10 }}>
            RDC{building.roofAccess ? ` and floor ${building.floorCount} (roof)` : ''} are granted automatically.
          </Text>
          <Button title={adding ? "Adding..." : "Grant Access"} onPress={handleAddCard} disabled={adding} />
        </View>
      ) : null}
      <Text style={styles.subHeader}>Residents ({residents.length})</Text>
      {loading && <ActivityIndicator style={{ marginVertical: 20 }} />}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={loading ? [] : residents}
        renderItem={renderItem}
        keyExtractor={item => item.cardId.toString()}
        ListHeaderComponent={listHeader}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4' },
  header: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, color:'#023c69' },
  addSection: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 20, elevation: 2 },
  subHeader: { fontWeight: 'bold', marginBottom: 10, fontSize: 16 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 10, marginBottom: 10 },
  cardRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'white', padding: 15, borderRadius: 8, marginBottom: 10, elevation: 1
  },
  residentName: { fontWeight: 'bold', fontSize: 16 },
  cardCode: { color: 'gray' },
  floors: { color: '#023c69', fontSize: 12, marginTop: 2 },
  flag: { color: 'red', fontSize: 10, fontWeight: 'bold' },
  floorBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#023c69', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  floorBtnActive: { backgroundColor: '#023c69' },
});
