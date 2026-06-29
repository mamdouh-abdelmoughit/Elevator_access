import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  SafeAreaView, KeyboardAvoidingView, Platform,
  StatusBar, ActivityIndicator, ScrollView, StyleSheet,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function CreateEmployeeScreen({ navigation }) {
  const [name,        setName]        = useState('');
  const [phone,       setPhone]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPw,      setShowPw]      = useState(false);
  const [loading,     setLoading]     = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !phone.trim() || !password) {
      Alert.alert('Champs requis', 'Veuillez remplir tous les champs.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Mot de passe trop court', 'Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }

    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync('authToken');
      const res = await fetch(`${API_URL}/users/employees`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), password }),
      });
      const data = await res.json();

      if (res.ok) {
        Alert.alert(
          'Compte créé',
          `Le compte technicien de "${data.name}" a été créé.\n\nTéléphone : ${data.phone}\n\nCommuniquez le mot de passe directement au technicien.`,
          [{ text: 'OK', onPress: () => {
            setName(''); setPhone(''); setPassword('');
            navigation.goBack();
          }}],
        );
      } else {
        Alert.alert('Erreur', data.error || 'Une erreur est survenue.');
      }
    } catch {
      Alert.alert('Erreur réseau', 'Impossible de se connecter au serveur.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          <View style={styles.iconBox}>
            <Text style={styles.iconText}>👷</Text>
          </View>
          <Text style={styles.title}>Créer un compte technicien</Text>
          <Text style={styles.subtitle}>
            Le technicien utilisera ces identifiants pour se connecter à l'application.
            Seul l'administrateur peut modifier les mots de passe.
          </Text>

          <Text style={styles.label}>Nom complet</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex : Karim Benali"
            placeholderTextColor="#64748B"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Numéro de téléphone</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex : 0661234567"
            placeholderTextColor="#64748B"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Mot de passe temporaire</Text>
          <View style={styles.pwRow}>
            <TextInput
              style={[styles.input, styles.pwInput]}
              placeholder="Min. 8 caractères"
              placeholderTextColor="#64748B"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPw(v => !v)}>
              <Text style={styles.eyeText}>{showPw ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              ⚠ Communiquez ces identifiants directement au technicien. Il ne pourra pas les modifier lui-même.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleCreate}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="white" />
              : <Text style={styles.btnText}>Créer le compte</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelLink}>
            <Text style={styles.cancelText}>Annuler</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: '#0F172A' },
  flex:     { flex: 1 },
  scroll:   { padding: 24, paddingTop: 32, paddingBottom: 48 },

  iconBox:  { width: 64, height: 64, borderRadius: 16, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  iconText: { fontSize: 30 },
  title:    { fontSize: 22, fontWeight: '800', color: '#F8FAFC', marginBottom: 8 },
  subtitle: { fontSize: 13, color: '#94A3B8', lineHeight: 20, marginBottom: 28 },

  label:    { fontSize: 13, fontWeight: '600', color: '#CBD5E1', marginBottom: 8, marginTop: 4 },
  input: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  pwRow:    { position: 'relative' },
  pwInput:  { paddingRight: 52, marginBottom: 20 },
  eyeBtn:   { position: 'absolute', right: 14, top: 14 },
  eyeText:  { fontSize: 18 },

  warningBox: {
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 24,
  },
  warningText: { color: '#FCD34D', fontSize: 13, lineHeight: 19 },

  btn:         { backgroundColor: '#3B82F6', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  btnDisabled: { opacity: 0.55 },
  btnText:     { color: 'white', fontSize: 16, fontWeight: '700' },

  cancelLink:  { alignItems: 'center', marginTop: 6 },
  cancelText:  { color: '#64748B', fontSize: 14 },
});
