import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, FlatList, Button, Modal, 
  TextInput, Alert, ActivityIndicator, TouchableOpacity 
} from 'react-native';
import { Picker } from '@react-native-picker/picker'; // ensure this is installed: npm install @react-native-picker/picker
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function DashboardScreen({ route, navigation }) {
  const { user } = route.params; 
  const [requests, setRequests] = useState([]);
  const [elevators, setElevators] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedElevator, setSelectedElevator] = useState(null);
  const [reqType, setReqType] = useState("BLOCK");
  const [residentName, setResidentName] = useState("");
  const [notes, setNotes] = useState("");

const fetchData = async () => {
    console.log("--- STARTING FETCH ---");
    setLoading(true);
    
    try {
      const token = await SecureStore.getItemAsync('authToken');
      
      // -------------------------------
      // 1. FETCH REQUESTS
      // -------------------------------
      console.log("1. Fetching Requests...");
      const reqResp = await fetch(`${API_URL}/requests/my`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (reqResp.ok) {
        const reqData = await reqResp.json();
        setRequests(reqData);
        console.log("   Requests loaded:", reqData.length);
      } else {
        console.log("   Failed to load requests:", reqResp.status);
      }

      // -------------------------------
      // 2. FETCH ELEVATORS
      // -------------------------------
      console.log("2. Fetching Elevators...");
      const elevResp = await fetch(`${API_URL}/elevators/my`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // READ ONCE as text to debug, then parse
      const textResponse = await elevResp.text(); 
      console.log("   Raw Elevator Response:", textResponse); 

      if (elevResp.ok) {
        const elevData = JSON.parse(textResponse); // <--- FIX APPLIED HERE
        setElevators(elevData);
        
        if(elevData.length > 0) {
            setSelectedElevator(elevData[0].id);
        }
      } else {
         Alert.alert("Error", "Could not fetch buildings. Check Backend logs.");
      }

    } catch (error) {
      console.error("CRITICAL ERROR:", error);
      Alert.alert("Crash", error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async () => {
    if (!residentName || !selectedElevator) {
      Alert.alert("Missing Info", "Please select an elevator and enter a name.");
      return;
    }

    try {
      const token = await SecureStore.getItemAsync('authToken');
      const response = await fetch(`${API_URL}/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          elevatorId: selectedElevator,
          type: reqType,
          residentName: residentName,
          notes: notes
        })
      });

      if (response.ok) {
        Alert.alert("Success", "Request sent to Admin.");
        setModalVisible(false);
        setResidentName("");
        setNotes("");
        fetchData(); 
      } else {
        Alert.alert("Error", "Could not send request.");
      }
    } catch (error) {
      Alert.alert("Error", error.message);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={{fontWeight:'bold'}}>{item.type}</Text>
        <Text style={{color: item.status === 'PENDING' ? 'orange' : 'green', fontWeight:'bold'}}>
          {item.status}
        </Text>
      </View>
      <Text style={{fontSize: 16, marginTop:5}}>{item.residentName}</Text>
      <Text style={{color:'gray', fontSize:12}}>Date: {new Date(item.createdAt).toLocaleDateString()}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome, {user.name}!</Text>
        <Button title="+ New Ticket" onPress={() => setModalVisible(true)} />
      </View>

      <Text style={styles.subtitle}>My Buildings: {elevators.length}</Text>
      <Text style={styles.subtitle}>My Requests:</Text>

      {loading ? <ActivityIndicator /> : (
        <FlatList 
          data={requests} 
          renderItem={renderItem} 
          keyExtractor={item => item.id.toString()}
          ListEmptyComponent={<Text style={styles.empty}>No requests yet.</Text>}
        />
      )}

      {/* MODAL */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Request</Text>
            
            <Text style={styles.label}>Building:</Text>
            <View style={styles.pickerBox}>
              <Picker
                selectedValue={selectedElevator}
                onValueChange={(val) => setSelectedElevator(val)}
              >
                {elevators.map(e => <Picker.Item key={e.id} label={e.name} value={e.id} />)}
              </Picker>
            </View>

            <Text style={styles.label}>Action:</Text>
            <View style={styles.pickerBox}>
              <Picker selectedValue={reqType} onValueChange={setReqType}>
                <Picker.Item label="Block Access" value="BLOCK" />
                <Picker.Item label="Activate Access" value="ACTIVATE" />
                <Picker.Item label="Lost Card" value="LOST_CARD" />
              </Picker>
            </View>

            <TextInput 
              style={styles.input} 
              placeholder="Resident Name" 
              value={residentName} 
              onChangeText={setResidentName} 
            />
            <TextInput 
              style={styles.input} 
              placeholder="Notes" 
              value={notes} 
              onChangeText={setNotes} 
            />

            <View style={styles.btnRow}>
              <Button title="Cancel" color="red" onPress={() => setModalVisible(false)} />
              <Button title="Send" onPress={handleSubmit} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 'bold' },
  subtitle: { fontSize: 16, color: 'gray', marginBottom: 5 },
  card: { backgroundColor: 'white', padding: 15, borderRadius: 8, marginBottom: 10, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  empty: { textAlign: 'center', marginTop: 20, color: 'gray' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', padding: 20, borderRadius: 10 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  label: { marginTop: 10, fontWeight: 'bold' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 10, marginTop: 5, borderRadius: 5 },
  pickerBox: { borderWidth: 1, borderColor: '#ddd', borderRadius: 5, marginTop: 5 },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 }
});