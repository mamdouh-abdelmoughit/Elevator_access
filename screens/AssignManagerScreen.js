import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, FlatList, Button, Alert, 
  ActivityIndicator, TouchableOpacity 
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function AssignManagerScreen() {
  const [managers, setManagers] = useState([]);
  const [elevators, setElevators] = useState([]);
  const [selectedManager, setSelectedManager] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const token = await SecureStore.getItemAsync('authToken');
      const headers = { 'Authorization': `Bearer ${token}` };

      // 1. Get Managers
      const manResp = await fetch(`${API_URL}/users/managers`, { headers });
      const manData = await manResp.json();
      
      // 2. Get Elevators
      const elevResp = await fetch(`${API_URL}/elevators`, { headers });
      const elevData = await elevResp.json();

      if (manResp.ok) {
        setManagers(manData);
        if (manData.length > 0) setSelectedManager(manData[0].id);
      }
      if (elevResp.ok) setElevators(elevData);

    } catch (error) {
      Alert.alert("Error", "Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAssign = async (elevatorId) => {
    if (!selectedManager) return;

    try {
      const token = await SecureStore.getItemAsync('authToken');
      const response = await fetch(`${API_URL}/elevators/${elevatorId}/assign-manager`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId: selectedManager })
      });

      if (response.ok) {
        // Update the local list to show the change immediately
        const updatedElevators = elevators.map(e => {
            if (e.id === elevatorId) {
                return { ...e, managerId: selectedManager };
            }
            return e;
        });
        setElevators(updatedElevators);
        Alert.alert("Success", "Elevator assigned!");
      } else {
        Alert.alert("Error", "Assignment failed");
      }
    } catch (error) {
      Alert.alert("Error", error.message);
    }
  };

  const renderElevator = ({ item }) => {
    const isAssignedToSelected = item.managerId === selectedManager;

    return (
      <View style={styles.card}>
        <View>
            <Text style={styles.elevName}>{item.name}</Text>
            <Text style={styles.elevLoc}>{item.location}</Text>
            {item.managerId ? (
                <Text style={styles.assignedText}>
                    Managed by ID: {item.managerId}
                </Text>
            ) : (
                <Text style={{color:'red', fontSize:12}}>No Manager</Text>
            )}
        </View>
        
        {isAssignedToSelected ? (
            <View style={styles.badge}>
                <Text style={{color:'white', fontWeight:'bold'}}>Owned</Text>
            </View>
        ) : (
            <Button 
                title="Assign" 
                onPress={() => handleAssign(item.id)} 
            />
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER: SELECT MANAGER */}
      <View style={styles.header}>
        <Text style={styles.label}>Select Syndic to Manage:</Text>
        <View style={styles.pickerBox}>
            <Picker
                selectedValue={selectedManager}
                onValueChange={(val) => setSelectedManager(val)}
            >
                {managers.map(m => (
                    <Picker.Item key={m.id} label={`${m.name} (${m.phone})`} value={m.id} />
                ))}
            </Picker>
        </View>
      </View>

      <Text style={styles.subTitle}>Elevator List:</Text>

      {loading ? <ActivityIndicator /> : (
        <FlatList 
            data={elevators}
            renderItem={renderElevator}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={{ paddingBottom: 50 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f4f4f4' },
  header: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 20, elevation: 3 },
  label: { fontWeight: 'bold', fontSize: 16, marginBottom: 10 },
  pickerBox: { borderWidth: 1, borderColor: '#ccc', borderRadius: 5 },
  subTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  card: { 
    backgroundColor: 'white', 
    padding: 15, 
    borderRadius: 8, 
    marginBottom: 10, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    elevation: 2 
  },
  elevName: { fontWeight: 'bold', fontSize: 16 },
  elevLoc: { color: 'gray', fontSize: 12 },
  assignedText: { fontSize: 10, color: '#27ae60', marginTop: 2 },
  badge: { backgroundColor: '#27ae60', padding: 8, borderRadius: 5 }
});