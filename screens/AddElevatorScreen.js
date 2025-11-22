// screens/AddElevatorScreen.js
import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, TextInput, Button, Alert, 
  KeyboardAvoidingView, Platform, Modal 
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as SecureStore from 'expo-secure-store';

const MOROCCO_REGION = {
  latitude: 31.7917,
  longitude: -7.0926,
  latitudeDelta: 5.0,
  longitudeDelta: 5.0,
};

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function AddElevatorScreen({ navigation }) {
  const [selectedCoord, setSelectedCoord] = useState(null);
  const [name, setName] = useState('');
  const [locationDesc, setLocationDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const handleMapPress = (e) => {
    setSelectedCoord(e.nativeEvent.coordinate);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!name || !locationDesc || !selectedCoord) {
      Alert.alert("Missing Info", "Please fill in all fields.");
      return;
    }

    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync('authToken');
      const response = await fetch(`${API_URL}/elevators`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: name,
          location: locationDesc,
          latitude: selectedCoord.latitude,
          longitude: selectedCoord.longitude
        })
      });

      if (response.ok) {
        Alert.alert("Success", "Elevator installed successfully!");
        setModalVisible(false);
        navigation.goBack();
      } else {
        Alert.alert("Error", "Failed to save.");
      }
    } catch (error) {
      Alert.alert("Network Error", "Check connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.instructionText}>
          1. Tap map to place pin. {'\n'} 2. Enter details in popup.
        </Text>
      </View>

      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={MOROCCO_REGION}
        onPress={handleMapPress}
      >
        {selectedCoord && (
          <Marker coordinate={selectedCoord} pinColor="red" draggable />
        )}
      </MapView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalContainer}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Install New Elevator</Text>
            
            {/* --- COORDINATES (Read Only) --- */}
            <Text style={styles.label}>GPS Coordinates:</Text>
            <Text style={styles.coordText}>
              {selectedCoord?.latitude.toFixed(5)}, {selectedCoord?.longitude.toFixed(5)}
            </Text>

            {/* --- INPUT 1: NAME --- */}
            <Text style={styles.label}>Specification d'ascenseur (Internal Name):</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Elevator #105 - Block B"
              value={name}
              onChangeText={setName}
            />

            {/* --- INPUT 2: ADDRESS --- */}
            <Text style={styles.label}>Address / Info sur rue, residence:</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Rue 12, Maarif, Imm. 4, 2nd Floor"
              value={locationDesc}
              onChangeText={setLocationDesc}
            />

            <View style={styles.buttonRow}>
              <Button title="Cancel" onPress={() => setModalVisible(false)} color="red" />
              <Button 
                title={loading ? "Saving..." : "Confirm Installation"} 
                onPress={handleSave} 
                disabled={loading} 
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  header: { padding: 15, backgroundColor: 'white', elevation: 3 },
  instructionText: { textAlign: 'center', fontWeight: 'bold' },
  modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  modalContent: { backgroundColor: 'white', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  
  // New Label Style
  label: { 
    fontSize: 14, 
    color: '#333', 
    fontWeight: 'bold', 
    marginBottom: 5, 
    marginTop: 10 
  },
  coordText: { fontSize: 16, color: 'gray', marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f9f9f9'
  },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 }
});