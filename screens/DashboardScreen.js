import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  Modal, TextInput, Button, Alert, ActivityIndicator 
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function DashboardScreen({ route }) {
  const { user } = route.params; // Logged in Syndic
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
    try {
      const token = await SecureStore.getItemAsync('authToken');
      
      // 1. Get My Requests History
      const reqResp = await fetch(`${API_URL}/requests/my`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const reqData = await reqResp.json();
      if (reqResp.ok) setRequests(reqData);

      // 2. Get My Elevators (We fetch all and filter by managerId)
      const elevResp = await fetch(`${API_URL}/elevators`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const elevData = await elevResp.json();
      if (elevResp.ok) {
        // Only keep elevators assigned to this Syndic
        const myElevators = elevData.filter(e => e.managerId === user.id);
        setElevators(myElevators);
        if(myElevators.length > 0) setSelectedElevator(myElevators[0].id);
      }

    } catch (error) {
      console.log(error);
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
        fetchData(); // Refresh list
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
        <Text style={styles.type}>{item.type}</Text>
        <Text style={[styles.status, 
          { color: item.status === 'PENDING' ? 'orange' : 'green' }]}>
          {item.status}
        </Text>
      </View>
      <Text style={styles.resident}>{item.residentName}</Text>
      <Text style={styles.elevator}>Building: {item.elevator.name}</Text>
      {item.notes ? <Text style={styles.notes}>"{item.notes}"</Text> : null}
      <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Requests</Text>
        <Button title="+ New Ticket" onPress={() => setModalVisible(true)} />
      </View>

      {loading ? <ActivityIndicator /> : (
        <FlatList 
          data={requests} 
          renderItem={renderItem} 
          keyExtractor={item => item.id.toString()}
          ListEmptyComponent={<Text style={styles.empty}>No requests yet.</Text>}
        />
      )}

      {/* --- NEW REQUEST MODAL --- */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Service Request</Text>
            
            <Text style={styles.label}>Select Building:</Text>
            <View style={styles.pickerBox}>
              <Picker
                selectedValue={selectedElevator}
                onValueChange={(val) => setSelectedElevator(val)}
              >
                {elevators.map(e => (
                   <Picker.Item key={e.id} label={e.name} value={e.id} />
                ))}
              </Picker>
            </View>

            <Text style={styles.label}>Action Type:</Text>
            <View style={styles.pickerBox}>
              <Picker selectedValue={reqType} onValueChange={setReqType}>
                <Picker.Item label="Block Access (Unpaid)" value="BLOCK" />
                <Picker.Item label="Activate Access (Paid)" value="ACTIVATE" />
                <Picker.Item label="Report Lost Card" value="LOST_CARD" />
                <Picker.Item label="Request New Card" value="NEW_CARD" />
              </Picker>
            </View>

            <Text style={styles.label}>Resident Name / Apt:</Text>
            <TextInput 
              style={styles.input} 
              placeholder="e.g. Mr Idrissi - Apt 4"
              value={residentName}
              onChangeText={setResidentName}
            />

            <Text style={styles.label}>Additional Notes:</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Optional details..."
              value={notes}
              onChangeText={setNotes}
            />

            <View style={styles.btnRow}>
              <Button title="Cancel" color="red" onPress={() => setModalVisible(false)} />
              <Button title="Submit" onPress={handleSubmit} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold' },
  card: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 10, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  type: { fontWeight: 'bold', fontSize: 16 },
  status: { fontWeight: 'bold' },
  resident: { fontSize: 18, marginTop: 5 },
  elevator: { color: 'gray', marginTop: 5 },
  notes: { fontStyle: 'italic', marginTop: 5, color: '#555' },
  date: { textAlign: 'right', color: '#ccc', fontSize: 12, marginTop: 10 },
  empty: { textAlign: 'center', marginTop: 50, color: 'gray' },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', padding: 20, borderRadius: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  label: { marginTop: 10, fontWeight: 'bold', color: '#333' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 5, marginTop: 5, backgroundColor: '#fafafa' },
  pickerBox: { borderWidth: 1, borderColor: '#ddd', borderRadius: 5, marginTop: 5 },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 }
});