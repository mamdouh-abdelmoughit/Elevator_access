// screens/HomeScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, TouchableOpacity, Linking } from 'react-native';
import * as Location from 'expo-location';       // <-- Commented out
import * as TaskManager from 'expo-task-manager'; // <-- Commented out

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
    // Alert.alert("Disabled", "Location tracking is currently disabled for development.");
    setIsLoading(true);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert("Permission Required", "This app needs location access to work.");
    setIsLoading(false);
    return;
    }
    // Also request background permission
    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') {
      Alert.alert("Background Permission Required", "Please allow location access 'All the time' in settings.");
      setIsLoading(false);
      return;
    }
  await checkStatus();
    
  };
  
  // --- UI RENDERING ---
  const renderEmployeeStatus = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      );
    }

    return (
      <View style={styles.statusContainer}>
        <Text style={styles.statusTitle}>Location Tracking</Text>
        <Text style={styles.statusText}>
          We are focusing on Elevator Controls right now.
        </Text>
        <View style={styles.badgeContainer}>
          <Text style={styles.badgeText}>⚠ Service: OFF</Text>
        </View>
        
        <View style={{marginTop: 20, width: '100%'}}>
           <TouchableOpacity 
              style={[styles.button, styles.buttonDisabled]} 
              onPress={requestForeground} 
           >
             <Text style={styles.buttonText}>Activer</Text>
           </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome, {user.name}!</Text>
        <Text style={styles.roleText}>{user.role}</Text>
      </View>

      {user.role === 'ADMIN' && (
        <View style={styles.adminActionContainer}> 
          <TouchableOpacity 
            style={styles.actionCard} 
            onPress={() => navigation.navigate('Map')}
          >
            <Text style={styles.actionCardTitle}>🗺️ Technician Map</Text>
            <Text style={styles.actionCardSubtitle}>View on-call technicians</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionCard, { borderLeftColor: '#10B981' }]} 
            onPress={() => navigation.navigate('AddElevator')}
          >
            <Text style={styles.actionCardTitle}>➕ Install New Elevator</Text>
            <Text style={styles.actionCardSubtitle}>Register a new elevator</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.actionCard, { borderLeftColor: '#F59E0B' }]} 
            onPress={() => navigation.navigate('AdminInbox')}
          >
            <Text style={styles.actionCardTitle}>📩 Check Requests</Text>
            <Text style={styles.actionCardSubtitle}>Service request inbox</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionCard, { borderLeftColor: '#8B5CF6' }]} 
            onPress={() => navigation.navigate('AssignManager')}
          >
            <Text style={styles.actionCardTitle}>👥 Assign Syndics</Text>
            <Text style={styles.actionCardSubtitle}>Assign managers to elevators</Text>
          </TouchableOpacity>
        </View>
      )}

      {user.role === 'EMPLOYEE' && renderEmployeeStatus()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    padding: 24, 
    backgroundColor: '#0F172A',
  },
  header: {
    marginBottom: 32,
    marginTop: 20,
    alignItems: 'center',
  },
  title: { 
    fontSize: 28, 
    fontWeight: '700', 
    color: '#F8FAFC',
    marginBottom: 8,
  },
  roleText: { 
    fontSize: 14, 
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '600'
  },
  adminActionContainer: {
    width: '100%',
    gap: 16,
  },
  actionCard: {
    backgroundColor: '#1E293B',
    padding: 20,
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  actionCardTitle: {
    color: '#F1F5F9',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  actionCardSubtitle: {
    color: '#94A3B8',
    fontSize: 14,
  },
  statusContainer: {
    backgroundColor: '#1E293B',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 12,
  },
  statusText: { 
    textAlign: 'center', 
    marginBottom: 20, 
    color: '#94A3B8',
    fontSize: 15,
    lineHeight: 22,
  },
  badgeContainer: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 10,
  },
  badgeText: {
    color: '#F59E0B',
    fontWeight: 'bold',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  buttonDisabled: {
    backgroundColor: '#334155',
  },
  buttonText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  }
});