import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, FlatList, Alert, 
  Button, RefreshControl 
} from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function AdminInboxScreen() {
  const [requests, setRequests] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRequests = async () => {
    setRefreshing(true);
    try {
      const token = await SecureStore.getItemAsync('authToken');
      const response = await fetch(`${API_URL}/requests/pending`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) setRequests(data);
    } catch (error) {
      console.log(error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      const token = await SecureStore.getItemAsync('authToken');
      const response = await fetch(`${API_URL}/requests/${id}/status`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        Alert.alert("Updated", `Request marked as ${newStatus}`);
        fetchRequests(); // Remove from list
      }
    } catch (error) {
      Alert.alert("Error", "Failed to update status");
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.tag}>{item.type}</Text>
        <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
      </View>
      
      <Text style={styles.mainText}>
        <Text style={{fontWeight: 'bold'}}>Syndic:</Text> {item.syndic.name} ({item.syndic.phone})
      </Text>
      <Text style={styles.mainText}>
        <Text style={{fontWeight: 'bold'}}>Building:</Text> {item.elevator.name}
      </Text>
      <Text style={styles.resident}>
        Target: {item.residentName}
      </Text>
      
      {item.notes ? (
        <View style={styles.noteBox}>
            <Text style={{fontStyle:'italic'}}>"{item.notes}"</Text>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <Button 
            title="Reject" 
            color="red" 
            onPress={() => handleUpdateStatus(item.id, "REJECTED")} 
        />
        <Button 
            title="Mark Done" 
            color="green" 
            onPress={() => handleUpdateStatus(item.id, "COMPLETED")} 
        />
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Admin Inbox ({requests.length})</Text>
      <FlatList 
        data={requests}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
        refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={fetchRequests} />
        }
        ListEmptyComponent={<Text style={styles.empty}>No pending requests.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#eef2f3' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 15, color: '#2c3e50' },
  card: { backgroundColor: 'white', padding: 15, borderRadius: 8, marginBottom: 15, elevation: 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  tag: { fontWeight: 'bold', color: 'white', backgroundColor: '#3498db', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  date: { color: 'gray', fontSize: 12 },
  mainText: { fontSize: 14, marginBottom: 2 },
  resident: { fontSize: 18, fontWeight: 'bold', marginVertical: 8, color: '#2c3e50' },
  noteBox: { backgroundColor: '#f9f9f9', padding: 8, borderRadius: 4, marginBottom: 10 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 10 },
  empty: { textAlign: 'center', marginTop: 50, color: 'gray', fontSize: 16 }
});