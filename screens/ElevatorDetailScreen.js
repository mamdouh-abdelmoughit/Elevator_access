// screens/ElevatorDetailScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Button, Alert, ActivityIndicator } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function ElevatorDetailScreen({ route }) {
  const { elevatorId, elevatorName } = route.params;
  const [status, setStatus] = useState("Loading...");
  const [lastUpdate, setLastUpdate] = useState("");
  const [selectedCommand, setSelectedCommand] = useState("OPEN_DOOR");
  const [loading, setLoading] = useState(false);

  // 1. Poll for Real-Time Status every 2 seconds
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const token = await SecureStore.getItemAsync('authToken');
        const response = await fetch(`${API_URL}/elevators/${elevatorId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.currentStatus) {
            setStatus(data.currentStatus);
            setLastUpdate(new Date().toLocaleTimeString());
        }
      } catch (e) {
        console.log("Polling error", e);
      }
    };

    fetchStatus(); // Initial call
    const interval = setInterval(fetchStatus, 2000); // Repeat every 2s
    return () => clearInterval(interval);
  }, []);

  // 2. Send Command to ESP32
  const handleSendCommand = async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync('authToken');
      const response = await fetch(`${API_URL}/elevators/${elevatorId}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ commandType: selectedCommand })
      });

      if (response.ok) {
        Alert.alert("Succès", "Commande envoyée à l'ascenseur.");
      } else {
        Alert.alert("Erreur", "Échec de l'envoi.");
      }
    } catch (error) {
      Alert.alert("Erreur Réseau", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{elevatorName}</Text>
      
      {/* STATUS SECTION */}
      <View style={styles.card}>
        <Text style={styles.label}>État Actuel (Real-Time):</Text>
        <Text style={styles.statusText}>{status}</Text>
        <Text style={styles.subText}>Dernière mise à jour: {lastUpdate}</Text>
      </View>

      {/* CONTROL SECTION */}
      <View style={[styles.card, { marginTop: 20 }]}>
        <Text style={styles.label}>Panneau de Contrôle (Relais):</Text>
        
        <View style={styles.pickerContainer}>
            <Picker
                selectedValue={selectedCommand}
                onValueChange={(itemValue) => setSelectedCommand(itemValue)}
            >
                <Picker.Item label="Ouvrir Porte (Relais 1)" value="OPEN_DOOR" />
                <Picker.Item label="Fermer Porte (Relais 2)" value="CLOSE_DOOR" />
                <Picker.Item label="Arrêt d'Urgence (OFF)" value="SHUTDOWN" />
                <Picker.Item label="Démarrer (ON)" value="START" />
            </Picker>
        </View>

        <Button 
            title={loading ? "Envoi..." : "Envoyer Commande"} 
            onPress={handleSendCommand}
            color="#d35400"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f4f4f4' },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  card: { backgroundColor: 'white', padding: 20, borderRadius: 10, elevation: 3 },
  label: { fontSize: 16, color: 'gray', marginBottom: 5 },
  statusText: { fontSize: 28, fontWeight: 'bold', color: '#2c3e50', textAlign: 'center', marginVertical: 10 },
  subText: { textAlign: 'center', color: '#ccc', fontSize: 12 },
  pickerContainer: { borderWidth: 1, borderColor: '#ccc', borderRadius: 5, marginBottom: 15 }
});