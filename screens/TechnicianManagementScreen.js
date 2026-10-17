import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const ROLE_LABEL = { EMPLOYEE: 'Technicien', MANAGER: 'Syndic' };
const ROLE_COLOR = { EMPLOYEE: '#1d4ed8', MANAGER: '#7c3aed' };

function UserCard({ user, onEdit, onDownload, onDelete }) {
  const isOnline = user.isOnline && user.locationUpdatedAt &&
    (Date.now() - new Date(user.locationUpdatedAt).getTime()) < 60000;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: user.role === 'EMPLOYEE' ? (isOnline ? '#22c55e' : '#94a3b8') : '#7c3aed' }]}>
          <Text style={styles.avatarText}>{(user.name || '?')[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.userName}>{user.name}</Text>
            <View style={[styles.roleBadge, { backgroundColor: ROLE_COLOR[user.role] + '22' }]}>
              <Text style={[styles.roleText, { color: ROLE_COLOR[user.role] }]}>{ROLE_LABEL[user.role]}</Text>
            </View>
          </View>
          <Text style={styles.userPhone}>{user.phone}</Text>
          {user.role === 'EMPLOYEE' && (
            <Text style={[styles.statusText, { color: isOnline ? '#22c55e' : '#94a3b8' }]}>
              {isOnline ? '● En ligne' : '● Hors ligne'}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.editBtn} onPress={() => onEdit(user)}>
          <Text style={styles.editBtnText}>✏️ Modifier</Text>
        </TouchableOpacity>
        {user.role === 'EMPLOYEE' && (
          <TouchableOpacity style={styles.downloadBtn} onPress={() => onDownload(user)}>
            <Text style={styles.downloadBtnText}>📥 Log GPS</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(user)}>
          <Text style={styles.deleteBtnText}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function EditModal({ user, onClose, onSaved, token }) {
  const [name, setName]         = useState(user.name);
  const [phone, setPhone]       = useState(user.phone);
  const [password, setPassword] = useState('');
  const [saving, setSaving]     = useState(false);

  const save = async () => {
    const body = {};
    if (name.trim() !== user.name)   body.name  = name.trim();
    if (phone.trim() !== user.phone) body.phone = phone.trim();
    if (password.length > 0)         body.password = password;
    if (Object.keys(body).length === 0) { onClose(); return; }

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        Alert.alert('Erreur', err.error || 'Impossible de modifier.');
        return;
      }
      Alert.alert('Succès', 'Utilisateur mis à jour.');
      onSaved();
    } catch {
      Alert.alert('Erreur', 'Erreur réseau.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modal}>
        <Text style={styles.modalTitle}>Modifier {user.name}</Text>

        <Text style={styles.label}>Nom</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} />

        <Text style={styles.label}>Téléphone</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

        <Text style={styles.label}>Nouveau mot de passe (laisser vide pour ne pas changer)</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword}
          secureTextEntry placeholder="••••••••" placeholderTextColor="#64748b" />

        <View style={styles.modalBtns}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Annuler</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Enregistrer</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function TechnicianManagementScreen() {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [token,   setToken]   = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      const t = await SecureStore.getItemAsync('authToken');
      setToken(t);
      const res = await fetch(`${API_URL}/users`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const all = await res.json();
        setUsers(all.filter(u => u.role === 'EMPLOYEE' || u.role === 'MANAGER'));
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const downloadLog = async (user) => {
    try {
      const dest = FileSystem.cacheDirectory + `log_${user.name.replace(/\s/g, '_')}.zip`;
      const dl = await FileSystem.downloadAsync(
        `${API_URL}/users/${user.id}/location-log/download`,
        dest,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await Sharing.shareAsync(dl.uri, { mimeType: 'application/zip' });
    } catch {
      Alert.alert('Erreur', 'Impossible de télécharger le log.');
    }
  };

  const handleDelete = (user) => {
    Alert.alert(
      'Supprimer ' + user.name + ' ?',
      'Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/users/${user.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) { load(); }
              else {
                const err = await res.json();
                Alert.alert('Erreur', err.error || 'Impossible de supprimer.');
              }
            } catch {
              Alert.alert('Erreur', 'Erreur réseau.');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#3b82f6" /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <FlatList
        data={users}
        keyExtractor={u => String(u.id)}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={<Text style={styles.empty}>Aucun utilisateur enregistré.</Text>}
        renderItem={({ item }) => (
          <UserCard
            user={item}
            onEdit={setEditing}
            onDownload={downloadLog}
            onDelete={handleDelete}
          />
        )}
      />

      {editing && (
        <EditModal
          user={editing}
          token={token}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  empty:  { color: '#64748b', textAlign: 'center', marginTop: 40, fontSize: 14 },

  card: {
    backgroundColor: '#1e293b', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#334155',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: 'white', fontWeight: '800', fontSize: 18 },
  nameRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  userName: { color: '#f1f5f9', fontWeight: '700', fontSize: 15 },
  roleBadge:{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  roleText: { fontSize: 11, fontWeight: '700' },
  userPhone:  { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  statusText: { fontSize: 12, fontWeight: '600', marginTop: 3 },

  cardActions: { flexDirection: 'row', gap: 8 },
  editBtn:     { flex: 1, backgroundColor: '#1d4ed8', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  editBtnText: { color: 'white', fontWeight: '600', fontSize: 13 },
  downloadBtn: { flex: 1, backgroundColor: '#0f766e', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  downloadBtnText: { color: 'white', fontWeight: '600', fontSize: 13 },
  deleteBtn:   { backgroundColor: '#7f1d1d', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center' },
  deleteBtnText: { color: '#fca5a5', fontWeight: '700', fontSize: 14 },

  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20,
  },
  modal: { backgroundColor: '#1e293b', borderRadius: 14, padding: 20 },
  modalTitle: { color: '#f1f5f9', fontWeight: '700', fontSize: 16, marginBottom: 16 },
  label:  { color: '#94a3b8', fontSize: 12, marginBottom: 4, marginTop: 10 },
  input: {
    backgroundColor: '#0f172a', color: '#f1f5f9', borderWidth: 1,
    borderColor: '#334155', borderRadius: 8, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 14,
  },
  modalBtns:    { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn:    { flex: 1, borderWidth: 1, borderColor: '#334155', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  cancelBtnText:{ color: '#94a3b8', fontWeight: '600' },
  saveBtn:      { flex: 1, backgroundColor: '#1d4ed8', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  saveBtnText:  { color: 'white', fontWeight: '600' },
});
