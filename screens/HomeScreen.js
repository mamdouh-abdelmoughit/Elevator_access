// screens/HomeScreen.js
import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, TouchableOpacity, Linking, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';

const LOCATION_TASK_NAME = 'background-location-task';
const API_URL = process.env.EXPO_PUBLIC_API_URL;
const FG_SEND_INTERVAL_MS = 25000;

export default function HomeScreen({ route, navigation }) {
  const { user } = route.params;

  const [foregroundPermission, setForegroundPermission] = useState(null);
  const [isTaskRunning, setIsTaskRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [fgGranted, setFgGranted] = useState(false);
  const [lastSent, setLastSent] = useState(null);
  const [sendError, setSendError] = useState(null);

  // ── Foreground position push ────────────────────────────────────────────────
  // Works with "While using the app" permission. Runs while this screen is
  // mounted (the technician's home screen), so the server always has a recent
  // fix even when the OS never fires the background task.
  const sendNow = useCallback(async () => {
    if (user.role !== 'EMPLOYEE' || !user?.id) return;
    try {
      const token = await SecureStore.getItemAsync('authToken');
      if (!token) { setSendError('Session expirée — reconnectez-vous.'); return; }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const res = await fetch(`${API_URL}/users/${user.id}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      });
      if (!res.ok) throw new Error(`Serveur ${res.status}`);
      setLastSent(Date.now());
      setSendError(null);
    } catch (e) {
      setSendError(e?.message || "Échec de l'envoi de la position");
    }
  }, [user.role, user?.id]);

  // Immediate send + periodic send while the screen is mounted and permitted.
  useEffect(() => {
    if (user.role !== 'EMPLOYEE' || !fgGranted) return;
    sendNow();
    const id = setInterval(sendNow, FG_SEND_INTERVAL_MS);
    return () => clearInterval(id);
  }, [user.role, fgGranted, sendNow]);

const checkStatus = useCallback(async () => {
  try {
    const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
    setForegroundPermission(fgStatus);
    setFgGranted(fgStatus === 'granted');

    if (fgStatus === 'granted') {
      const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
      
      if (bgStatus === 'granted') {
        const isRunning = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
        if (!isRunning) {
          try {
            await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 30000,        // report even when the phone isn't moving
              distanceInterval: 15,
              deferredUpdatesInterval: 30000,
              foregroundService: {
                notificationTitle: "Genestor Tracking",
                notificationBody: "Location active",
                notificationColor: "#FF6600",
              },
              showsBackgroundLocationIndicator: true,
              pausesUpdatesAutomatically: false,
            });
            setIsTaskRunning(true);
          } catch (e) {
            // Background service failed to start — foreground push still covers us.
            setIsTaskRunning(false);
          }
        } else {
          setIsTaskRunning(true);
        }
      } else {
        setIsTaskRunning(false);
      }
    } else {
      setIsTaskRunning(false);
    }
  } catch (error) {
    console.log("Error in checkStatus:", error);
  } finally {
    setIsLoading(false);
  }
}, []);
  // Re-check every time this screen comes into focus (handles logout → login)
  useFocusEffect(
    useCallback(() => {
      if (user.role === 'EMPLOYEE') {
        setIsLoading(true);
        checkStatus();
      } else {
        setIsLoading(false);
      }
    }, [user.role, checkStatus])
  );


  // --- USER ACTION ---
  const requestForeground = async () => {
    setIsLoading(true);

    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') {
      const { canAskAgain } = await Location.getForegroundPermissionsAsync();
      setIsLoading(false);
      if (!canAskAgain) {
        Alert.alert(
          "Localisation requise",
          "Vous avez refusé la localisation. Activez-la dans les paramètres de l'application.",
          [{ text: "Ouvrir les paramètres", onPress: () => Linking.openSettings() }],
          { cancelable: false }
        );
      }
      return;
    }

    // Foreground granted — start pushing position immediately, regardless of
    // whether background ("Toujours autoriser") gets granted below.
    setFgGranted(true);

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') {
      const { canAskAgain } = await Location.getBackgroundPermissionsAsync();
      Alert.alert(
        "Suivi en arrière-plan",
        "Le suivi fonctionne quand l'application est ouverte. Pour le suivi permanent, sélectionnez « Toujours autoriser » dans les réglages.",
        canAskAgain
          ? [{ text: "OK" }]
          : [{ text: "Ouvrir les réglages", onPress: () => Linking.openSettings() }],
      );
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

    if (fgGranted) {
      return (
        <View style={styles.statusContainer}>
          <Text style={styles.statusTitle}>Localisation</Text>
          <View style={[styles.badgeContainer, styles.badgeActive]}>
            <Text style={[styles.badgeText, styles.badgeTextActive]}>● Suivi GPS actif</Text>
          </View>

          {sendError ? (
            <Text style={[styles.statusText, { color: '#f87171' }]}>⚠ {sendError}</Text>
          ) : (
            <Text style={styles.statusText}>
              {lastSent
                ? `Dernière position envoyée à ${new Date(lastSent).toLocaleTimeString()}.`
                : 'Envoi de votre position en cours…'}
            </Text>
          )}

          <Text style={styles.subtleText}>
            {isTaskRunning
              ? 'Suivi en arrière-plan actif.'
              : "Arrière-plan inactif — le suivi ne fonctionne que lorsque l'application est ouverte. Sélectionnez « Toujours autoriser » dans les réglages pour le suivi permanent."}
          </Text>

          {!isTaskRunning && (
            <TouchableOpacity style={[styles.button, { marginTop: 14 }]} onPress={() => Linking.openSettings()}>
              <Text style={styles.buttonText}>Ouvrir les réglages</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return (
      <View style={styles.statusContainer}>
        <Text style={styles.statusTitle}>Localisation requise</Text>
        <Text style={styles.statusText}>
          L'application nécessite votre localisation pour fonctionner. Veuillez l'activer pour continuer.
        </Text>
        <View style={{ marginTop: 20, width: '100%' }}>
          <TouchableOpacity style={styles.button} onPress={requestForeground}>
            <Text style={styles.buttonText}>Activer la localisation</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
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

          <TouchableOpacity
            style={[styles.actionCard, { borderLeftColor: '#EC4899' }]}
            onPress={() => navigation.navigate('CreateEmployee')}
          >
            <Text style={styles.actionCardTitle}>👷 Créer un technicien</Text>
            <Text style={styles.actionCardSubtitle}>Créer les identifiants d'un technicien</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionCard, { borderLeftColor: '#0d9488' }]}
            onPress={() => navigation.navigate('TechnicianManagement')}
          >
            <Text style={styles.actionCardTitle}>⚙️ Gérer les techniciens</Text>
            <Text style={styles.actionCardSubtitle}>Modifier, réinitialiser, télécharger logs GPS</Text>
          </TouchableOpacity>
        </View>
      )}

      {user.role === 'EMPLOYEE' && renderEmployeeStatus()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  contentContainer: {
    padding: 24,
    flexGrow: 1,
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
  subtleText: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 13,
    lineHeight: 19,
  },
  badgeContainer: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 10,
  },
  badgeActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  badgeText: {
    color: '#F59E0B',
    fontWeight: 'bold',
    fontSize: 14,
  },
  badgeTextActive: {
    color: '#22c55e',
  },
  button: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
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