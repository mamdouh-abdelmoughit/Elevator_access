// screens/LoginScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, TouchableOpacity, Alert, SafeAreaView} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as SecureStore from 'expo-secure-store'; 


const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function LoginScreen({ navigation }) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

// front-syndic/screens/LoginScreen.js

const handleLogin = async () => {
  try {
    const response = await fetch(`${API_URL}/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password }),
    });
    const data = await response.json();

    if (response.ok) {
      // 1. Save Token
      await SecureStore.setItemAsync('authToken', data.token);
      await SecureStore.setItemAsync('currentUser', JSON.stringify(data.user));

      // 2. CHECK ROLE AND NAVIGATE CORRECTLY
      if (data.user.role === 'MANAGER') {
          // Send Syndics to the Dashboard
          navigation.replace('Dashboard', { user: data.user });
      } else {
          // Send everyone else (if any) to Home, or block them
          Alert.alert("Access Denied", "This app is for Syndic Managers only.");
      }
    } else {
      Alert.alert(t('errorTitle'), data.error || "Login failed");
    }
  } catch (error) {
    Alert.alert(t('errorTitle'), t('networkError'));
    console.error(error);
  }
};

  return (
    <SafeAreaView style={styles.container}>
        <View style={styles.innerContainer}>
      <Text style={styles.title}>{t('Espace Syndic')}</Text>
      <TextInput style={styles.input} placeholder="Enter phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <TextInput style={styles.input} placeholder="Enter password" value={password} onChangeText={setPassword} secureTextEntry />
      <Button title={t('login')} onPress={handleLogin} />
      <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
        <Text style={styles.linkText}>{t('dontHaveAccount')}</Text>
      </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  // The main container now just makes sure it fills the screen
  container: { 
    flex: 1,
    backgroundColor: '#fff',
  },
  // We put the old styling into an inner container
  innerContainer: {
    flex: 1,
    justifyContent: 'center', 
    padding: 20 
  },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  input: { width: '100%', height: 40, borderColor: 'gray', borderWidth: 1, borderRadius: 5, marginBottom: 15, paddingHorizontal: 10 },
  linkText: { color: 'blue', textAlign: 'center', marginTop: 20 },
});