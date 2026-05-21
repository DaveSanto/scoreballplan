import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { GameRules } from '../types';

const FIELD_COUNTS = [9, 10, 11, 12];

const FORMAT_LABELS: Record<number, string> = {
  9:  '9 — Standard (baseball/softball)',
  10: '10 — Extra outfielder / EO',
  11: '11 — Four outfielders + EH',
  12: '12 — Twelve-player format',
};

export function GameRulesModal({
  visible,
  rules,
  title,
  onSave,
  onClose,
}: {
  visible: boolean;
  rules: GameRules;
  title: string;
  onSave: (rules: GameRules) => void;
  onClose: () => void;
}) {
  const [fieldCount, setFieldCount] = useState(rules.fieldPlayerCount);
  const [battingAll, setBattingAll] = useState(rules.battingAllPlayers);

  useEffect(() => {
    if (visible) {
      setFieldCount(rules.fieldPlayerCount);
      setBattingAll(rules.battingAllPlayers);
    }
  }, [visible, rules]);

  function handleSave() {
    onSave({ fieldPlayerCount: fieldCount, battingAllPlayers: battingAll });
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#555" />
            </Pressable>
          </View>

          {/* Field player count */}
          <Text style={styles.sectionLabel}>Players in the field</Text>
          <View style={styles.chipRow}>
            {FIELD_COUNTS.map((n) => (
              <Pressable
                key={n}
                style={[styles.chip, fieldCount === n && styles.chipActive]}
                onPress={() => setFieldCount(n)}
              >
                <Text style={[styles.chipText, fieldCount === n && styles.chipTextActive]}>
                  {n}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.chipHint}>{FORMAT_LABELS[fieldCount]}</Text>

          {/* Batting lineup */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Whole roster bats</Text>
              <Text style={styles.toggleHint}>
                {battingAll
                  ? 'Every active player takes a turn at bat'
                  : `Only the ${fieldCount} starters bat — bench players are subs`}
              </Text>
            </View>
            <Switch
              value={battingAll}
              onValueChange={setBattingAll}
              trackColor={{ true: '#1a5c2e', false: '#ccc' }}
              thumbColor="#fff"
            />
          </View>

          <Pressable style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>Save Format</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: -8,
  },
  chipRow: { flexDirection: 'row', gap: 10 },
  chip: {
    width: 52,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#f0f0ef',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipActive: { backgroundColor: '#edf6f0', borderColor: '#1a5c2e' },
  chipText: { fontSize: 16, fontWeight: '700', color: '#555' },
  chipTextActive: { color: '#1a5c2e' },
  chipHint: { fontSize: 12, color: '#888', marginTop: -8 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f7f7f5',
    borderRadius: 12,
    padding: 14,
  },
  toggleInfo: { flex: 1, gap: 3 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  toggleHint: { fontSize: 12, color: '#888', lineHeight: 16 },
  saveBtn: {
    backgroundColor: '#1a5c2e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
