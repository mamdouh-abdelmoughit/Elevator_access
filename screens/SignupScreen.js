// screens/SignupScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';

// IMPORTANT: Replace with your computer's IP
const API_URL = 'http://172.20.10.2:3000';

export default function SignupScreen({ navigation }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const handleSignup = async () => {
    if (!name || !email) {
      Alert.alert(t('errorTitle'), t('fillAllFields'));
      return;
    }
    try {
      const response = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      const jsonResponse = await response.json();
      if (response.ok) {
        Alert.alert(t('successTitle'), t('userCreated', { name: jsonResponse.name, id: jsonResponse.id }));
        navigation.replace('Home');
      } else {
        Alert.alert(t('errorTitle'), jsonResponse.error || 'Something went wrong.');
      }
    } catch (error) {
      console.error(error);
      Alert.alert(t('errorTitle'), t('networkError'));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('createAccount')}</Text>
      <TextInput style={styles.input} placeholder={t('enterName')} value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder={t('enterEmail')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Button title={t('signUp')} onPress={handleSignup} />
      <TouchableOpacity onPress={() => navigation.navigate('Login')}>
        <Text style={styles.linkText}>{t('alreadyHaveAccount')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  input: { width: '100%', height: 40, borderColor: 'gray', borderWidth: 1, borderRadius: 5, marginBottom: 15, paddingHorizontal: 10 },
  linkText: { color: 'blue', textAlign: 'center', marginTop: 20 },
});