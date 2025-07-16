// screens/MapScreen.js
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert, Text } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useTranslation } from 'react-i18next';

const API_URL = 'http://172.20.10.2:3000';
// For this test, we are hardcoding the elevator we want to view.
const TARGET_ELEVATOR_ID = 1;

export default function MapScreen() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [mapRegion, setMapRegion] = useState(null);
  const [elevator, setElevator] = useState(null);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch the elevator's own location first to center the map
        // NOTE: We need to create a GET /elevators/:id endpoint
        const elevatorResponse = await fetch(`${API_URL}/elevators/${TARGET_ELEVATOR_ID}`);
        const elevatorData = await elevatorResponse.json();
        if (!elevatorResponse.ok || !elevatorData.latitude) {
          throw new Error('Elevator location not found.');
        }
        setElevator(elevatorData);

        // Center the map on the elevator
        const initialRegion = {
          latitude: elevatorData.latitude,
          longitude: elevatorData.longitude,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        };
        setMapRegion(initialRegion);

        // Now fetch the nearby employees
        const employeesResponse = await fetch(`${API_URL}/elevators/${TARGET_ELEVATOR_ID}/nearby-employees`);
        const employeesData = await employeesResponse.json();
        if (!employeesResponse.ok) {
          throw new Error('Could not fetch employees.');
        }
        setEmployees(employeesData);

      } catch (error) {
        Alert.alert(t('errorTitle'), error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);
    const handleCall = (phoneNumber) => {
    if (phoneNumber) {
      Linking.openURL(`tel:${phoneNumber}`);
    } else {
      Alert.alert("Cannot Call", "This employee does not have a phone number registered.");
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={mapRegion} provider={PROVIDER_GOOGLE}>
        {/* Place a marker for the elevator */}
        {elevator && (
          <Marker
            coordinate={{ latitude: elevator.latitude, longitude: elevator.longitude }}
            title={elevator.name}
            description={elevator.location}
            pinColor="blue" // Elevator is blue
          />
        )}
        {/* Employee Markers with Call functionality */}
        {employees.map(emp => (
          <Marker
            key={emp.id}
            coordinate={{ latitude: emp.latitude, longitude: emp.longitude }}
            title={emp.name}
            description={`Tap to call ${emp.phone}`}
            pinColor="green"
            // This event fires when the user taps the text bubble (callout)
            onCalloutPress={() => handleCall(emp.phone)}
          />
        ))}
        {/* Place a marker for each employee */}
        {employees.map(emp => (
          <Marker
            key={emp.id}
            coordinate={{ latitude: emp.latitude, longitude: emp.longitude }}
            title={emp.name}
            description={`Distance: ${emp.distance_km.toFixed(2)} km`}
            pinColor="green" // Employees are green
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', alignItems: 'center' },
  map: { ...StyleSheet.absoluteFillObject },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});