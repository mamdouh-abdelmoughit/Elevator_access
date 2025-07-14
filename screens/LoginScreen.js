// screens/LoginScreen.js
import React from 'react';
import { View, Text, TextInput, Button, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function LoginScreen({ navigation }) {
  const { t } = useTranslation();
  // ... (handleLogin logic will be added later)

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('welcomeBack')}</Text>
      <TextInput style={styles.input} placeholder={t('enterEmail')} keyboardType="email-address" autoCapitalize="none" />
      <Button title={t('login')} onPress={() => navigation.replace('Home')} />
      <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
        <Text style={styles.linkText}>{t('dontHaveAccount')}</Text>
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