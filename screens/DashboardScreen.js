import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, FlatList, Button, Modal, 
  TextInput, Alert, ActivityIndicator, TouchableOpacity, SafeAreaView
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
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
  
  // Action State
  const [reqType, setReqType] = useState("NEW_CARD"); 
  const [residentName, setResidentName] = useState("");
  const [notes, setNotes] = useState("");
  
  // Data Lists
  const [allResidents, setAllResidents] = useState([]); 

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync('authToken');
      
      // 1. Fetch Requests
      const reqResp = await fetch(`${API_URL}/requests/my`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (reqResp.ok) setRequests(await reqResp.json());

      // 2. Fetch Elevators
      const elevResp = await fetch(`${API_URL}/elevators/my`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (elevResp.ok) {
        const elevData = await elevResp.json();
        setElevators(elevData);
        
        if (elevData.length > 0) {
            const myElevatorId = elevData[0].id;
            setSelectedElevator(myElevatorId);

            // 3. FETCH ALL RESIDENTS (Active & Blocked)
            const resResp = await fetch(`${API_URL}/permissions/elevator/${myElevatorId}/residents`, {
                 headers: { 'Authorization': `Bearer ${token}` }
            });

            if (resResp.ok) {
                const data = await resResp.json();
                // Store everyone: active and blocked
                setAllResidents(data.filter(r => r.card && r.card.label));
            }
        }
      }
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async () => {
    if (!residentName || !selectedElevator) {
      Alert.alert("Missing Info", "Please select a building and provide a Resident Name.");
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
        Alert.alert("Request Sent", "The Admin has been notified.");
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

  // --- HELPER: Filter Residents based on Action ---
  const getFilteredResidents = () => {
    if (reqType === "BLOCK_CARD") {
        // Show Active residents (candidates to be blocked)
        return allResidents.filter(r => r.isActive);
    } else if (reqType === "UNBLOCK_CARD") {
        // Show Blocked residents (candidates to be unblocked)
        return allResidents.filter(r => !r.isActive);
    }
    return [];
  };

  const filteredList = getFilteredResidents();

  // --- UI RENDERING ---
  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={{flexDirection:'row', alignItems:'center'}}>
          <View style={[styles.statusDot, { backgroundColor: item.status === 'PENDING' ? 'orange' : item.status === 'COMPLETED' ? 'green' : 'red' }]} />
          <Text style={{fontWeight:'bold', color:'#333'}}> {item.type.replace('_', ' ')}</Text>
        </View>
        <Text style={{fontSize:12, color:'gray'}}>{new Date(item.createdAt).toLocaleDateString()}</Text>
      </View>
      <Text style={{fontSize: 16, marginTop:8}}>👤 {item.residentName}</Text>
      <Text style={{fontSize: 14, color:'gray', marginTop:2}}>🏢 {item.elevator?.name || 'Unknown'}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome, {user.name}!</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => setModalVisible(true)}>
          <Text style={{color:'white', fontWeight:'bold'}}>+ New Ticket</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>My Buildings</Text>
      <View style={{ marginBottom: 20 }}>
        {elevators.length === 0 ? (
           <Text style={{color:'gray', fontStyle:'italic'}}>No buildings assigned.</Text>
        ) : (
          elevators.map((elev) => (
            <View key={elev.id} style={styles.buildingCard}>
              <Text style={{ fontWeight: 'bold', fontSize: 18, color:'#023c69' }}>🏢 {elev.name}</Text>
              <Text style={{ color: 'gray' }}>📍 {elev.location}</Text>
            </View>
          ))
        )}
      </View>

      <Text style={styles.sectionTitle}>Recent Requests</Text>
      {loading ? <ActivityIndicator color="#023c69" /> : (
        <FlatList 
          data={requests} 
          renderItem={renderItem} 
          keyExtractor={item => item.id.toString()}
          ListEmptyComponent={<Text style={styles.empty}>No requests yet.</Text>}
          contentContainerStyle={{paddingBottom: 20}}
        />
      )}

      {/* --- MODAL --- */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Service Ticket</Text>
            
            {/* 1. SELECT BUILDING */}
            <Text style={styles.label}>1. Select Building</Text>
            <View style={styles.pickerBox}>
              {elevators.length > 0 ? (
                <Picker
                  selectedValue={selectedElevator}
                  onValueChange={(val) => setSelectedElevator(val)}
                  style={{ width: '100%', height: 120 }} 
                  itemStyle={{ color: 'black', fontSize: 18, height: 120 }}
                >
                  {elevators.map((e) => (
                    <Picker.Item key={e.id} label={e.name} value={e.id} />
                  ))}
                </Picker>
              ) : (
                <Text style={{ padding: 15, color: 'gray', textAlign: 'center' }}>No buildings.</Text>
              )}
            </View>

            {/* 2. SELECT ACTION (3 BUTTONS) */}
            <Text style={styles.label}>2. Select Action</Text>
            <View style={styles.actionRow}>
              {/* Button 1: New Card */}
              <TouchableOpacity 
                style={[styles.actionBtn, reqType === "NEW_CARD" && styles.actionBtnActive]} 
                onPress={() => { setReqType("NEW_CARD"); setResidentName(""); }}
              >
                <Text style={[styles.actionText, reqType === "NEW_CARD" && styles.actionTextActive]}>New Card</Text>
              </TouchableOpacity>

              {/* Button 2: Block */}
              <TouchableOpacity 
                style={[styles.actionBtn, reqType === "BLOCK_CARD" && styles.actionBtnActive]} 
                onPress={() => { setReqType("BLOCK_CARD"); setResidentName(""); }}
              >
                <Text style={[styles.actionText, reqType === "BLOCK_CARD" && styles.actionTextActive]}>Block</Text>
              </TouchableOpacity>
              
              {/* Button 3: Unblock (THIS WAS MISSING) */}
              <TouchableOpacity 
                style={[styles.actionBtn, reqType === "UNBLOCK_CARD" && styles.actionBtnActive]} 
                onPress={() => { setReqType("UNBLOCK_CARD"); setResidentName(""); }}
              >
                <Text style={[styles.actionText, reqType === "UNBLOCK_CARD" && styles.actionTextActive]}>Unblock</Text>
              </TouchableOpacity>
            </View>

            {/* 3. INPUT SECTION */}
            {reqType === "NEW_CARD" ? (
                <>
                    <Text style={styles.label}>3. New Card Owner Name</Text>
                    <TextInput 
                        style={styles.input} 
                        placeholder="e.g. Mr. Idrissi - Apt 4" 
                        value={residentName} 
                        onChangeText={setResidentName} 
                    />
                </>
            ) : (
                <>
                    <Text style={styles.label}>
                        {reqType === "BLOCK_CARD" ? "3. Select Resident to Block" : "3. Select Resident to Unblock"}
                    </Text>
                    <View style={styles.pickerBox}>
                        {filteredList.length > 0 ? (
                            <Picker
                                selectedValue={residentName}
                                onValueChange={(val) => setResidentName(val)}
                                style={{ width: '100%', height: 120 }}
                                itemStyle={{ color: 'black', fontSize: 16, height: 120 }}
                            >
                                <Picker.Item label="-- Select Resident --" value="" />
                                {filteredList.map((r, index) => (
                                    <Picker.Item key={index} label={r.card.label} value={r.card.label} />
                                ))}
                            </Picker>
                        ) : (
                            <Text style={{padding:15, textAlign:'center', color:'gray'}}>
                                {reqType === "BLOCK_CARD" ? "No active residents." : "No blocked residents."}
                            </Text>
                        )}
                    </View>
                </>
            )}

            <TextInput 
              style={[styles.input, {height: 60}]} 
              placeholder="Additional Notes" 
              value={notes} 
              onChangeText={setNotes}
              multiline 
            />

            <View style={styles.footerBtns}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={{color:'red', fontSize: 16, marginRight: 20}}>Cancel</Text>
              </TouchableOpacity>
              <Button title="Submit Ticket" onPress={handleSubmit} color="#023c69" />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor:'#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems:'center', marginBottom: 20, marginTop: 10 },
  title: { fontSize: 22, fontWeight: 'bold', color:'#333' },
  newBtn: { backgroundColor: '#023c69', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6 },
  sectionTitle: { fontSize: 18, fontWeight:'bold', marginBottom: 10, color:'#555' },
  buildingCard: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 10, elevation: 2, borderLeftWidth: 5, borderLeftColor: '#023c69' },
  card: { backgroundColor: 'white', padding: 15, borderRadius: 8, marginBottom: 10, elevation: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 5 },
  empty: { textAlign: 'center', marginTop: 20, color: 'gray' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', padding: 20, borderRadius: 15, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color:'#023c69' },
  label: { marginTop: 15, marginBottom: 5, fontWeight: 'bold', color:'#333' },
  pickerBox: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, height: 120, justifyContent:'center', overflow:'hidden', backgroundColor:'#f9f9f9' },
  
  // Action Buttons
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ccc', alignItems: 'center' },
  actionBtnActive: { backgroundColor: '#e6f0ff', borderColor: '#023c69' },
  actionText: { color: 'gray', fontSize: 12 },
  actionTextActive: { color: '#023c69', fontWeight: 'bold' },

  input: { borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, backgroundColor: '#f9f9f9', marginTop: 5 },
  footerBtns: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 25 }
});