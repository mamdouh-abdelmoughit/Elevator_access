import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Button,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  FlatList,
  RefreshControl
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function ElevatorDetailScreen({ route }) {
  const { elevatorId, elevatorName } = route.params;

  // --- EXISTING STATE ---
  const [status, setStatus] = useState("Loading...");
  const [lastUpdate, setLastUpdate] = useState("");
  const [selectedCommand, setSelectedCommand] = useState("OPEN_DOOR_ON");
  const [loading, setLoading] = useState(false);

  // --- NEW STATE FOR WHITELIST ---
  const [whitelistModalVisible, setWhitelistModalVisible] = useState(false);
  const [whitelist, setWhitelist] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [downloadingLogs, setDownloadingLogs] = useState(false);

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

// --- 1. FETCH WHITELIST ---
  const fetchWhitelist = async () => {
    setLoadingList(true);
    try {
      const token = await SecureStore.getItemAsync('authToken');
      const response = await fetch(`${API_URL}/elevators/${elevatorId}/whitelist`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setWhitelist(data);
      } else {
        Alert.alert("Erreur", "Impossible de charger la liste.");
      }
    } catch (error) {
      console.log(error);
    } finally {
      setLoadingList(false);
    }
  };

  // Auto-fetch when modal opens
  useEffect(() => {
    if (whitelistModalVisible) fetchWhitelist();
  }, [whitelistModalVisible]);

// --- 2. HANDLE BLOCK/UNBLOCK (CONNECTED TO API) ---
  const handleToggleAccess = (cardId, currentStatus) => {
    // Determine action: If currently active (true), we want to BLOCK. If blocked (false), we UNBLOCK.
    const action = currentStatus ? "BLOCK" : "UNBLOCK"; 

    Alert.alert(
      "Confirm Action", 
      `Are you sure you want to ${action} this card?`, 
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Yes, Confirm", 
          onPress: async () => {
try {
            const token = await SecureStore.getItemAsync('authToken');
            const url = `${API_URL}/elevators/${elevatorId}/access-control`;
            
            console.log("🚀 Sending Request to:", url); // Check if URL is correct

            const response = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ 
                cardId: cardId, 
                action: action 
              })
            });

            // 🔍 DEBUG: Read text first!
            const responseText = await response.text();
            console.log("📩 Server Response:", responseText); // <--- THIS WILL SHOW THE REAL ERROR

            if (response.ok) {
               // Only parse JSON if request was good
               // const data = JSON.parse(responseText); (Optional if you return JSON)
               Alert.alert("Success", `Card has been ${action}ED.`);
               fetchWhitelist(); 
            } else {
               Alert.alert("Server Error", "Check console for HTML details");
            }
          } catch (error) {
            console.log("❌ Network Error:", error);
            Alert.alert("Network Error", "Check connection");
          }
          } 
        }
      ]
    );
  };

const renderCardItem = ({ item }) => {
    // ✅ NEW: Read the real status from the database
    // If permissions array exists, take the first one. Otherwise default to true.
    const isActive = item.permissions && item.permissions.length > 0 
        ? item.permissions[0].isActive 
        : true; 

    return (
      <View style={styles.cardItem}>
        <View style={styles.cardHeaderRow}>
          {/* Tag updates automatically based on 'isActive' */}
          <Text style={[styles.tag, isActive ? styles.tagActive : styles.tagBlocked]}>
            {isActive ? "ACTIVE" : "BLOCKED"}
          </Text>
          <Text style={styles.cardCode}>ID: {item.code}</Text>
        </View>

        {/* ... Rest of your code (User Info) ... */}
        
        <Text style={styles.residentName}>
           {item.user?.name || item.label || "Utilisateur Inconnu"}
        </Text>
        {/* ... */}

        <View style={styles.actionRow}>
           {/* Update Buttons to use 'isActive' variable */}
          <TouchableOpacity 
            style={[styles.actionBtn, styles.btnBlock]} 
            onPress={() => handleToggleAccess(item.id, isActive)} // Pass real status
          >
            <Text style={styles.btnText}>⛔ Block</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.actionBtn, styles.btnUnblock]} 
            onPress={() => handleToggleAccess(item.id, isActive)} // Pass real status
          >
            <Text style={styles.btnText}>✅ Allow</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };
  // 3. Download today's state logs as ZIP then auto-delete from DB
  const handleDownloadLogs = async () => {
    setDownloadingLogs(true);
    try {
      const token = await SecureStore.getItemAsync('authToken');
      const today = new Date().toISOString().slice(0, 10);
      const url   = `${API_URL}/logs/elevator/${elevatorId}/export?date=${today}`;

      const dest = FileSystem.documentDirectory + `elevator-${elevatorId}-${today}.zip`;
      const { status } = await FileSystem.downloadAsync(url, dest, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (status === 200) {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(dest, { mimeType: 'application/zip' });
        } else {
          Alert.alert('Téléchargé', `Fichier enregistré dans :\n${dest}`);
        }
      } else if (status === 404) {
        Alert.alert('Aucun log', "Pas de logs d'état pour aujourd'hui.");
      } else {
        Alert.alert('Erreur', `Téléchargement échoué (statut ${status}).`);
      }
    } catch (e) {
      Alert.alert('Erreur réseau', e.message);
    } finally {
      setDownloadingLogs(false);
    }
  };

  // 4. Send Command to ESP32
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
        
        {/* BUTTON TO OPEN MODAL */}
        <TouchableOpacity
          style={styles.whitelistButton}
          onPress={() => setWhitelistModalVisible(true)}
        >
          <Text style={styles.whitelistButtonText}>🔑 Voir les Cartes Actives</Text>
        </TouchableOpacity>

        {/* DOWNLOAD TODAY'S STATE LOGS */}
        <TouchableOpacity
          style={[styles.whitelistButton, { backgroundColor: '#1a5276', marginTop: 10 }]}
          onPress={handleDownloadLogs}
          disabled={downloadingLogs}
        >
          {downloadingLogs
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.whitelistButtonText}>📥 Télécharger Logs du Jour</Text>
          }
        </TouchableOpacity>
      </View>

      {/* CONTROL SECTION */}
      <View style={[styles.card, { marginTop: 20 }]}>
        <Text style={styles.label}>Panneau de Contrôle (Relais):</Text>
        
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={selectedCommand}
            onValueChange={(itemValue) => setSelectedCommand(itemValue)}
          >
            <Picker.Item label="--- COMMANDES STANDARD ---" value="" enabled={false} />
            <Picker.Item label="🟢 Ouvrir Porte (ON)" value="OPEN_DOOR_ON" />
            <Picker.Item label="🔴 Ouvrir Porte (OFF)" value="OPEN_DOOR_OFF" />
            <Picker.Item label="🟢 Fermer Porte (ON)" value="CLOSE_DOOR_ON" />
            <Picker.Item label="🔴 Fermer Porte (OFF)" value="CLOSE_DOOR_OFF" />
            <Picker.Item label="🟢 Arrêt Urgence (ON)" value="SHUTDOWN_ON" />
            <Picker.Item label="🔴 Arrêt Urgence (OFF)" value="SHUTDOWN_OFF" />
            
            <Picker.Item label="--- MODE RÉVISION ---" value="" enabled={false} />
            <Picker.Item label="🟢 Activer Révision (ON)" value="REVISION_MODE_ON" />
            <Picker.Item label="🔴 Désactiver Révision (OFF)" value="REVISION_MODE_OFF" />
            <Picker.Item label="⬆️ Monter Révision (ON)" value="REV_MONTEE_ON" />
            <Picker.Item label="🛑 Monter Révision (OFF)" value="REV_MONTEE_OFF" />
            <Picker.Item label="⬇️ Descendre Révision (ON)" value="REV_DESCENTE_ON" />
            <Picker.Item label="🛑 Descendre Révision (OFF)" value="REV_DESCENTE_OFF" />
          </Picker>
        </View>

        <Button 
            title={loading ? "Envoi..." : "Envoyer Commande"} 
            onPress={handleSendCommand}
            color="#d35400"
            disabled={loading}
        />
      </View>
{/* --- WHITELIST MODAL --- */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={whitelistModalVisible}
        onRequestClose={() => setWhitelistModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Authorized Cards</Text>
            <TouchableOpacity onPress={() => setWhitelistModalVisible(false)}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* List */}
          <FlatList
            data={whitelist}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderCardItem}
            contentContainerStyle={{ padding: 20 }}
            refreshControl={
                <RefreshControl refreshing={loadingList} onRefresh={fetchWhitelist} />
            }
            ListEmptyComponent={
                <Text style={styles.emptyText}>No active cards found.</Text>
            }
          />

          {/* --- NEW RETURN BUTTON AT BOTTOM --- */}
          <View style={styles.modalFooter}>
            <Button 
                title="Return to Dashboard" 
                onPress={() => setWhitelistModalVisible(false)} 
                color="#2c3e50"
            />
          </View>

        </View>
      </Modal>
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
  pickerContainer: { borderWidth: 1, borderColor: '#ccc', borderRadius: 5, marginBottom: 15 },
  
// --- NEW STYLES TO ADD ---
  whitelistButton: { backgroundColor: '#34495e', padding: 15, borderRadius: 10, marginTop: 15, alignItems: 'center' },
  whitelistButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

  // Modal Structure
  modalContainer: { flex: 1, backgroundColor: '#eef2f3' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: 'white', elevation: 2 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#2c3e50' },
  closeButton: { fontSize: 18, color: '#e74c3c', fontWeight: 'bold' },

  // Inbox Card Style
  cardItem: { backgroundColor: 'white', padding: 15, borderRadius: 8, marginBottom: 15, elevation: 2 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  residentName: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50', marginBottom: 5 },
  subInfo: { fontSize: 14, color: '#7f8c8d', marginBottom: 2 },
  cardCode: { color: 'gray', fontSize: 12, fontFamily: 'monospace' },

  // Tags
  tag: { fontWeight: 'bold', color: 'white', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, overflow: 'hidden', fontSize: 12 },
  tagActive: { backgroundColor: '#27ae60' }, 
  tagBlocked: { backgroundColor: '#c0392b' },

  // Action Buttons
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 10 },
  actionBtn: { flex: 1, padding: 10, borderRadius: 5, marginHorizontal: 5, alignItems: 'center' },
  btnBlock: { backgroundColor: '#fff0f0', borderWidth: 1, borderColor: '#e74c3c' },
  btnUnblock: { backgroundColor: '#f0fff0', borderWidth: 1, borderColor: '#27ae60' },
  btnText: { fontWeight: 'bold', fontSize: 14, color: '#333' },
  
  emptyText: { textAlign: 'center', marginTop: 50, color: 'gray', fontSize: 16 }
});