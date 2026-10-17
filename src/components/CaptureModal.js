// "Present the badge on the cabin reader" — reads the badge code from the
// elevator itself, so the Syndic never has to type a code (the number printed
// on a badge is usually NOT the code the reader sends).
//
// mode="enroll"   : returns the code of an UNREGISTERED badge via onCaptured(code)
// mode="identify" : shows who a badge belongs to (or that it is unknown)
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Modal, Animated, Easing, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { C, R, T } from '../theme';
import { Button, Avatar } from './ui';

const TTL = 90;

export default function CaptureModal({ visible, buildingId, mode = 'enroll', onCaptured, onClose, onOpenResident, onAddUnknown }) {
  const [phase, setPhase] = useState('starting'); // starting | waiting | found | error
  const [remaining, setRemaining] = useState(TTL);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [offline, setOffline] = useState(false);
  const since = useRef(null);
  const pulse = useRef(new Animated.Value(0)).current;

  const start = useCallback(async () => {
    setPhase('starting'); setResult(null); setError(null); setRemaining(TTL);
    try {
      const r = await api(`/elevators/${buildingId}/card-capture`, { method: 'POST' });
      since.current = r.since;
      setOffline(!r.online);
      setPhase('waiting');
    } catch (e) {
      setError(e.message); setPhase('error');
    }
  }, [buildingId]);

  useEffect(() => { if (visible) start(); }, [visible, start]);

  // Pulse animation while waiting
  useEffect(() => {
    if (phase !== 'waiting') return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    pulse.setValue(0); loop.start();
    return () => loop.stop();
  }, [phase, pulse]);

  // Countdown + polling
  useEffect(() => {
    if (!visible || phase !== 'waiting') return;
    const tick = setInterval(() => setRemaining(r => r - 1), 1000);
    const poll = setInterval(async () => {
      try {
        const swipes = await api(`/elevators/${buildingId}/swipes?since=${encodeURIComponent(since.current)}`);
        if (swipes.length === 0) return;
        const swipe = swipes[swipes.length - 1]; // the first one presented
        setResult(swipe);
        setPhase('found');
        if (mode === 'enroll' && !swipe.known) onCaptured?.(swipe.cardCode);
      } catch { /* keep polling */ }
    }, 1500);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [visible, phase, buildingId, mode, onCaptured]);

  useEffect(() => { if (remaining <= 0 && phase === 'waiting') { setPhase('error'); setError("Aucun badge n'a été présenté à temps."); } }, [remaining, phase]);

  const ring = (delay) => ({
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6 + delay, 1.6 + delay] }) }],
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
  });

  const renderBody = () => {
    if (phase === 'found' && result) {
      if (mode === 'enroll' && !result.known) {
        return (
          <>
            <View style={[s.bigIcon, { backgroundColor: C.successSoft }]}><Ionicons name="checkmark" size={40} color={C.success} /></View>
            <Text style={s.title}>Badge détecté</Text>
            <Text style={s.code}>{result.cardCode}</Text>
            <Text style={s.text}>Le code a été rempli automatiquement.</Text>
            <Button title="Continuer" onPress={onClose} style={s.fullBtn} />
          </>
        );
      }
      if (result.known) {
        return (
          <>
            <Avatar name={result.residentName} size={72} tone={result.sameBuilding ? 'accent' : 'warning'} />
            <Text style={[s.title, { marginTop: 14 }]}>{result.residentName}</Text>
            <Text style={s.code}>{result.cardCode}</Text>
            <Text style={s.text}>
              {result.sameBuilding
                ? (mode === 'enroll' ? 'Ce badge est déjà attribué à ce résident.' : 'Ce badge appartient à ce résident.')
                : 'Ce badge est déjà utilisé dans un autre immeuble.'}
            </Text>
            {mode === 'identify' && result.sameBuilding ? (
              <Button title="Voir la fiche" icon="person" onPress={() => onOpenResident?.(result)} style={s.fullBtn} />
            ) : null}
            <Button title="Présenter un autre badge" variant="secondary" icon="refresh" onPress={start} style={s.fullBtn} />
          </>
        );
      }
      return (
        <>
          <View style={[s.bigIcon, { backgroundColor: C.warningSoft }]}><Ionicons name="help" size={40} color={C.warning} /></View>
          <Text style={s.title}>Badge inconnu</Text>
          <Text style={s.code}>{result.cardCode}</Text>
          <Text style={s.text}>Ce badge n'est attribué à personne.</Text>
          <Button title="Attribuer ce badge" icon="person-add" onPress={() => onAddUnknown?.(result.cardCode)} style={s.fullBtn} />
          <Button title="Présenter un autre badge" variant="secondary" icon="refresh" onPress={start} style={s.fullBtn} />
        </>
      );
    }
    if (phase === 'error') {
      return (
        <>
          <View style={[s.bigIcon, { backgroundColor: C.dangerSoft }]}><Ionicons name="alert" size={40} color={C.danger} /></View>
          <Text style={s.title}>Lecture impossible</Text>
          <Text style={s.text}>{error}</Text>
          <Button title="Réessayer" icon="refresh" onPress={start} style={s.fullBtn} />
        </>
      );
    }
    return (
      <>
        <View style={s.radar}>
          <Animated.View style={[s.ring, ring(0)]} />
          <Animated.View style={[s.ring, ring(0.3)]} />
          <View style={s.radarCore}><Ionicons name="card" size={34} color="#fff" /></View>
        </View>
        <Text style={s.title}>Présentez le badge</Text>
        <Text style={s.text}>
          Passez le badge devant le lecteur <Text style={{ fontWeight: '800' }}>à l'intérieur de la cabine</Text>.
          {'\n'}Le code sera lu automatiquement.
        </Text>
        {offline ? (
          <View style={s.warn}>
            <Ionicons name="cloud-offline" size={16} color={C.warning} />
            <Text style={s.warnText}>Le lecteur semble hors ligne : la lecture risque de ne pas aboutir.</Text>
          </View>
        ) : null}
        <Text style={s.countdown}>{phase === 'starting' ? 'Connexion…' : `En attente… ${remaining}s`}</Text>
      </>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={{ alignItems: 'center' }}>{renderBody()}</View>
          {phase !== 'found' || mode === 'identify' || result?.known ? (
            <Button title="Fermer" variant="ghost" onPress={onClose} style={{ marginTop: 6 }} />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 34 },
  handle: { width: 42, height: 5, borderRadius: 3, backgroundColor: C.border, alignSelf: 'center', marginBottom: 18 },
  radar: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  ring: { position: 'absolute', width: 110, height: 110, borderRadius: 55, backgroundColor: C.accent },
  radarCore: { width: 82, height: 82, borderRadius: 41, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  bigIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { ...T.h2, textAlign: 'center' },
  code: { ...T.mono, fontSize: 22, fontWeight: '800', color: C.brand, marginTop: 6, letterSpacing: 1 },
  text: { ...T.sub, textAlign: 'center', marginTop: 8, lineHeight: 20, paddingHorizontal: 10 },
  countdown: { ...T.small, marginTop: 18, fontWeight: '700' },
  warn: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: C.warningSoft, padding: 10, borderRadius: R.md, marginTop: 14 },
  warnText: { flex: 1, fontSize: 12, color: C.warning, fontWeight: '600' },
  fullBtn: { alignSelf: 'stretch', marginTop: 12 },
});
