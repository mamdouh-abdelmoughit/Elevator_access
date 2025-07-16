// screens/HomeScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, Button, Linking } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

const LOCATION_TASK_NAME = 'background-location-task';

export default function HomeScreen({ route, navigation }) {
  const { user } = route.params;

  // We need to track both permissions separately now
  const [foregroundPermission, setForegroundPermission] = useState(null);
  const [backgroundPermission, setBackgroundPermission] = useState(null);
  const [isTaskRunning, setIsTaskRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // A function to check the current state of all permissions and tasks
  const checkStatus = useCallback(async () => {
    const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
    const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
    setForegroundPermission(fgStatus);
    setBackgroundPermission(bgStatus);
    
    if (fgStatus === 'granted' && bgStatus === 'granted') {
      const isRunning = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
      if (!isRunning) {
        // If permissions are good but task isn't running, start it.
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, { /* ... options ... */ });
      }
      setIsTaskRunning(await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME));
    } else {
        setIsTaskRunning(false); // If permissions are bad, task can't be running
    }
    setIsLoading(false);
  }, []);

  // Check status when the screen first loads
  useEffect(() => {
    if (user.role === 'EMPLOYEE') {
      checkStatus();
    } else {
      setIsLoading(false);
    }
  }, [user.role, checkStatus]);


  // --- USER ACTION FUNCTIONS ---

  const requestForeground = async () => {
    setIsLoading(true);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert("Permission Required", "This app cannot function without basic location access.");
    }
    await checkStatus(); // Re-check everything after the user makes a choice
  };
  
  const requestBackground = async () => {
    setIsLoading(true);
    // This is triggered by the user pressing a specific button
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== 'granted') {
       Alert.alert(
        'Action Required',
        'To enable 24/7 tracking, please go to your phone\'s settings, find this app, and set location access to "Allow All the Time".',
        [{ text: 'Open Settings', onPress: () => Linking.openSettings() }]
      );
    }
    await checkStatus(); // Re-check everything after the user makes a choice
  };


  // --- UI RENDERING ---

  const renderEmployeeStatus = () => {
    if (isLoading) {
      return <ActivityIndicator size="large" />;
    }

    // Case 1: Foreground permission not granted yet.
    if (foregroundPermission !== 'granted') {
      return (
        <View style={styles.statusContainer}>
          <Text style={styles.statusTitle}>Step 1: Allow Location Access</Text>
          <Text style={styles.statusText}>This app needs to know your location to function.</Text>
          <Button title="Allow Location" onPress={requestForeground} />
        </View>
      );
    }

    // Case 2: Foreground is granted, but background is not.
    if (backgroundPermission !== 'granted') {
      return (
        <View style={styles.statusContainer}>
          <Text style={styles.statusTitle}>Step 2: Enable 24/7 Tracking</Text>
          <Text style={styles.statusText}>For on-call duty, please enable "Allow All the Time" location access.</Text>
          <Button title="Enable Background Tracking" onPress={requestBackground} />
        </View>
      );
    }

    // Case 3: All permissions granted.
    return (
      <View style={styles.statusContainer}>
        <Text style={styles.statusTitle}>Tracking Status: Active</Text>
        <Text style={styles.statusText}>Service is running in the background.</Text>
        <Text style={{color: 'green', fontWeight: 'bold'}}>✔ All permissions granted</Text>
        <Text style={{color: isTaskRunning ? 'green' : 'red', fontWeight: 'bold'}}>
          ✔ Background Service: {isTaskRunning ? 'Running' : 'Not Running'}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome, {user.name}!</Text>
      <Text style={styles.roleText}>(Role: {user.role})</Text>

      {user.role === 'ADMIN' && (
        <Button title="View On-Call Technician Map" onPress={() => navigation.navigate('Map')} />
      )}

      {user.role === 'EMPLOYEE' && renderEmployeeStatus()}
    </View>
  );
}



const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 50, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  roleText: { fontSize: 16, color: 'gray', textAlign: 'center', marginBottom: 40 },
  buttonContainer: { marginVertical: 10 },
  statusText: { textAlign: 'center', marginBottom: 20, color: '#333' },
  statusContainer: {
    marginTop: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    alignItems: 'center',
    width: '90%'
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  }
});