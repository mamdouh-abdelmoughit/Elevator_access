import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, FlatList, Alert, 
  TextInput, Button, TouchableOpacity, ActivityIndicator 
} from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function BuildingAccessScreen({ route, navigation }) {
  const { elevatorId, elevatorName } = route.params;
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State for Adding Card
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  // 1. Fetch ALL Cards (Active & Blocked) using Admin Endpoint
  const fetchPermissions = async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync('authToken');
      const response = await fetch(`${API_URL}/permissions/elevator/${elevatorId}/admin`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPermissions(data);
      }
    } catch (error) {
      Alert.alert("Error", "Could not fetch cards.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, []);

  // 2. ACTION: Toggle Status (Block/Unblock)
  const handleToggleStatus = async (permissionId, currentStatus, name) => {
    const action = currentStatus ? "Block" : "Unblock";
    const newStatus = !currentStatus;

    Alert.alert(
      `${action} Access?`,
      `Are you sure you want to ${action.toLowerCase()} ${name}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: action, 
          style: currentStatus ? 'destructive' : 'default',
          onPress: async () => {
            try {
              const token = await SecureStore.getItemAsync('authToken');
              // CALL THE TOGGLE ENDPOINT
              const response = await fetch(`${API_URL}/permissions/${permissionId}/status`, {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ isActive: newStatus })
              });

              if (response.ok) {
                  fetchPermissions(); // Refresh list to show new color
                  Alert.alert("Success", `User has been ${action}ed.`);
              } else {
                  Alert.alert("Error", "Update failed.");
              }
            } catch (e) {
              Alert.alert("Error", "Network error.");
            }
          }
        }
      ]
    );
  };

  // 3. ACTION: Add New Card
  const handleAddCard = async () => {
    if (!newCode || !newLabel) {
      Alert.alert("Missing Info", "Enter Card Code and Resident Name.");
      return;
    }
    setAdding(true);
    try {
      const token = await SecureStore.getItemAsync('authToken');

      // Step A: Create Card (if not exists)
      const cardResp = await fetch(`${API_URL}/cards`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code: newCode, label: newLabel })
      });

      let cardData = await cardResp.json();
      
      if (!cardData.id) {
         Alert.alert("Error", "Card code might already exist. Please check inputs.");
         setAdding(false);
         return;
      }

      // Step B: Create Permission (Default Active)
      const permResp = await fetch(`${API_URL}/permissions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
            cardId: cardData.id, 
            elevatorId: elevatorId, 
            relay: 1 
        })
      });

      if (permResp.ok) {
        Alert.alert("Success", "Card Added & Access Granted!");
        setNewCode('');
        setNewLabel('');
        fetchPermissions();
      } else {
        Alert.alert("Error", "Failed to grant permission.");
      }

    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setAdding(false);
    }
  };

  const renderItem = ({ item }) => {
    const isActive = item.isActive; // Assuming backend sends 'isActive' boolean

    return (
        <View style={[styles.cardRow, { opacity: isActive ? 1 : 0.6, borderColor: isActive ? 'transparent' : 'red', borderWidth: isActive ? 0 : 1 }]}>
          <View>
            <Text style={styles.residentName}>
                {isActive ? "🟢" : "🔴"} {item.card.label || "Unknown"}
            </Text>
            <Text style={styles.cardCode}>Code: {item.card.code}</Text>
            {!isActive && <Text style={{color:'red', fontSize:10, fontWeight:'bold'}}>ACCESS BLOCKED</Text>}
          </View>
          
          <Button 
            title={isActive ? "Block" : "Unblock"} 
            color={isActive ? "red" : "green"} 
            onPress={() => handleToggleStatus(item.id, isActive, item.card.label)} 
          />
        </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Manage Access: {elevatorName}</Text>

      {/* ADD SECTION */}
      <View style={styles.addSection}>
        <Text style={styles.subHeader}>Add New Resident</Text>
        <TextInput 
          style={styles.input} 
          placeholder="Card Code (e.g. 12345)" 
          value={newCode} 
          onChangeText={setNewCode} 
          keyboardType="numeric"
        />
        <TextInput 
          style={styles.input} 
          placeholder="Resident Name (e.g. Mr. Alami)" 
          value={newLabel} 
          onChangeText={setNewLabel} 
        />
        <Button 
            title={adding ? "Adding..." : "Grant Access"} 
            onPress={handleAddCard} 
            disabled={adding} 
        />
      </View>

      <Text style={styles.subHeader}>Resident List ({permissions.length})</Text>
      {loading ? <ActivityIndicator /> : (
        <FlatList 
            data={permissions} 
            renderItem={renderItem} 
            keyExtractor={item => item.id.toString()} 
            contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f4f4f4' },
  header: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, color:'#023c69' },
  addSection: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 20, elevation: 2 },
  subHeader: { fontWeight: 'bold', marginBottom: 10, fontSize: 16 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 10, marginBottom: 10 },
  cardRow: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'white', padding: 15, borderRadius: 8, marginBottom: 10, elevation: 1
  },
  residentName: { fontWeight: 'bold', fontSize: 16 },
  cardCode: { color: 'gray' }
});