// screens/HomeScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, Button, Linking } from 'react-native';
// import * as Location from 'expo-location';       // <-- Commented out
// import * as TaskManager from 'expo-task-manager'; // <-- Commented out

const LOCATION_TASK_NAME = 'background-location-task';

export default function HomeScreen({ route, navigation }) {
  const { user } = route.params;

  const [foregroundPermission, setForegroundPermission] = useState(null);
  const [isTaskRunning, setIsTaskRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // --- MODIFIED: Logic commented out to prevent errors ---
  const checkStatus = useCallback(async () => {
    console.log("Location tracking is temporarily DISABLED for debugging.");
    
    // Simulate that we are done loading so the UI shows up
    setIsLoading(false);
    setIsTaskRunning(false); 

    /* 
    // ORIGINAL LOGIC HIDDEN BELOW:
    try {
      const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
      setForegroundPermission(fgStatus);
      
      if (fgStatus === 'granted') {
        const isRunning = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
        if (!isRunning) {
          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
             accuracy: Location.Accuracy.Balanced,
             distanceInterval: 20, 
             deferredUpdatesInterval: 5000, 
             foregroundService: {
               notificationTitle: "Elevator Tracking",
               notificationBody: "Technician location active."
             },
             showsBackgroundLocationIndicator: true, 
             pausesUpdatesAutomatically: false,
          });
        }
        setIsTaskRunning(true);
      } else {
        setIsTaskRunning(false);
      }
    } catch (error) {
      console.log("Error in checkStatus:", error);
    } finally {
      setIsLoading(false);
    }
    */
  }, []);

  // Check status on mount
  useEffect(() => {
    if (user.role === 'EMPLOYEE') {
      checkStatus();
    } else {
      setIsLoading(false);
    }
  }, [user.role, checkStatus]);


  // --- USER ACTION ---
  const requestForeground = async () => {
    Alert.alert("Disabled", "Location tracking is currently disabled for development.");
    /*
    setIsLoading(true);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert("Permission Required", "This app needs location access to work.");
    }
    await checkStatus();
    */
  };
  
  // --- UI RENDERING ---
  const renderEmployeeStatus = () => {
    if (isLoading) {
      return <ActivityIndicator size="large" />;
    }

    return (
      <View style={styles.statusContainer}>
        <Text style={styles.statusTitle}>Tracking Disabled</Text>
        <Text style={styles.statusText}>
          We are focusing on Elevator Controls right now.
        </Text>
        <Text style={{color: 'orange', fontWeight: 'bold', marginBottom: 10}}>
          ⚠ Location Service: OFF
        </Text>
        
        {/* Optional: Button to force stop if needed */}
        <View style={{marginTop: 20}}>
             <Button 
                title="Enable (Currently Disabled)" 
                onPress={requestForeground} 
                color="gray"
             />
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome, {user.name}!</Text>
      <Text style={styles.roleText}>(Role: {user.role})</Text>

    {user.role === 'ADMIN' && (
        <View style={{ width: '100%', gap: 15 }}> 
          {/* Button 1: Existing Map */}
          <Button 
            title="View On-Call Technician Map" 
            onPress={() => navigation.navigate('Map')} 
          />

          {/* Button 2: New Install Screen */}
          <Button 
            title="+ Install New Elevator" 
            color="green" 
            onPress={() => navigation.navigate('AddElevator')} 
          />
          <Button 
            title="📩 Inbox: Check Requests" 
            color="#d35400" 
            onPress={() => navigation.navigate('AdminInbox')} 
          />
          <Button 
            title="👥 Assign Syndics to Elevators" 
            color="#8e44ad" // Purple color
            onPress={() => navigation.navigate('AssignManager')} 
          />
        </View>
      )}

      {user.role === 'EMPLOYEE' && renderEmployeeStatus()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 50, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  roleText: { fontSize: 16, color: 'gray', textAlign: 'center', marginBottom: 40 },
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