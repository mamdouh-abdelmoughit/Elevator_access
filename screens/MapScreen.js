// screens/MapScreen.js
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Callout } from 'react-native-maps';
import * as SecureStore from 'expo-secure-store';
import { Linking } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

// Default view: Center of Morocco
const INITIAL_REGION = {
  latitude: 31.7917,
  longitude: -7.0926,
  latitudeDelta: 5,
  longitudeDelta: 5,
};

// 1. CRITICAL CHANGE: Added { navigation } here so we can use it later
export default function MapScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [elevators, setElevators] = useState([]);
  const [technicians, setTechnicians] = useState([]);

  const fetchData = async () => {
    try {
      const token = await SecureStore.getItemAsync('authToken');
      
      // 1. Fetch ALL Elevators
      const elevResp = await fetch(`${API_URL}/elevators`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const elevData = await elevResp.json();

      // 2. Fetch ALL Users (and filter for Employees with location)
      const userResp = await fetch(`${API_URL}/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const userData = await userResp.json();

      if (elevResp.ok) setElevators(elevData);
      
      if (userResp.ok) {
        // Filter: Only Employees who have a recorded location
        const activeTechs = userData.filter(u => 
            u.role === 'EMPLOYEE' && u.latitude && u.longitude
        );
        setTechnicians(activeTechs);
      }

    } catch (error) {
      // Alert.alert("Error", "Could not load map data."); // Optional to suppress noise
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  // Refresh data every time the screen opens
  useEffect(() => {
    fetchData();
    
    // Optional: Auto-refresh every 10 seconds to see Technicians moving
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCall = (phone) => {
    Linking.openURL(`tel:${phone}`);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <MapView 
        style={styles.map} 
        initialRegion={INITIAL_REGION} 
        provider={PROVIDER_GOOGLE}
      >
        {/* --- RENDER ELEVATORS (Blue Markers) --- */}
        {elevators.map(elev => (
          <Marker
            key={`elev-${elev.id}`}
            coordinate={{ latitude: elev.latitude, longitude: elev.longitude }}
            pinColor="blue"
          >
            <Callout tooltip={false}>
              <View style={styles.calloutView}>
                <Text style={styles.calloutTitle}>🏢 {elev.name}</Text>
                <Text style={{fontSize:12, color:'#555'}}>{elev.location}</Text>
                <Text style={{fontWeight:'bold', color:'black', marginVertical:4}}>
                  {elev.currentStatus || 'Unknown'}
                </Text>
                <TouchableOpacity style={styles.calloutBtn}
                  onPress={() => navigation.navigate('ElevatorDetail', { elevatorId: elev.id, elevatorName: elev.name })}>
                  <Text style={styles.calloutBtnText}>Ouvrir les contrôles ➔</Text>
                </TouchableOpacity>
              </View>
            </Callout>
          </Marker>
        ))}

        {/* --- RENDER TECHNICIANS (Green Markers) --- */}
        {technicians.map(tech => (
          <Marker
            key={`tech-${tech.id}`}
            coordinate={{ latitude: tech.latitude, longitude: tech.longitude }}
            pinColor="green"
          >
            <Callout tooltip={false}>
              <View style={styles.calloutView}>
                <Text style={styles.calloutTitle}>👷 {tech.name}</Text>
                <Text style={{fontSize:12, color:'#555', marginBottom:8}}>{tech.phone}</Text>
                <TouchableOpacity style={[styles.calloutBtn, {backgroundColor:'#16a34a'}]}
                  onPress={() => handleCall(tech.phone)}>
                  <Text style={styles.calloutBtnText}>📞 Appeler</Text>
                </TouchableOpacity>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Legend / Info Box */}
      <View style={styles.legend}>
        <Text style={{color: 'blue', fontWeight: 'bold'}}>● Elevators ({elevators.length})</Text>
        <Text style={{color: 'green', fontWeight: 'bold'}}>● Technicians ({technicians.length})</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  legend: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 8,
    elevation: 5,
    gap: 5
  },
  calloutView: {
    width: 190,
    padding: 8,
    alignItems: 'center',
  },
  calloutTitle: {
    fontWeight: 'bold',
    marginBottom: 4,
    fontSize: 15,
  },
  calloutBtn: {
    backgroundColor: '#1d4ed8',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  calloutBtnText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 13,
  }
});