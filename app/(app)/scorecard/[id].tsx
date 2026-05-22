import { Ionicons } from '@expo/vector-icons';
import { router, useGlobalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AtBatRecord, PathKey, Scorecard, ScorecardHalfInning } from '../../../src/types';
import { subscribeToScorecard, updateScorecard } from '../../../src/firebase/db';

// ── Diamond constants ──────────────────────────────────────────────────────────

const DS = 52; // diamond container size px
const LINE_LEN = 32;
const LINE_W = 2.5;

// Base center positions within DS×DS container
const HP = { x: DS / 2, y: DS - 4 };
const FIRST = { x: DS - 4, y: DS / 2 };
const SECOND = { x: DS / 2, y: 4 };
const THIRD = { x: 4, y: DS / 2 };

type PathSpec = { cx: number; cy: number; angle: string };
const PATH_SPECS: Record<PathKey, PathSpec> = {
  b1: { cx: (HP.x + FIRST.x) / 2, cy: (HP.y + FIRST.y) / 2, angle: '-45deg' },
  '12': { cx: (FIRST.x + SECOND.x) / 2, cy: (FIRST.y + SECOND.y) / 2, angle: '45deg' },
  '23': { cx: (SECOND.x + THIRD.x) / 2, cy: (SECOND.y + THIRD.y) / 2, angle: '-45deg' },
  '3h': { cx: (THIRD.x + HP.x) / 2, cy: (THIRD.y + HP.y) / 2, angle: '45deg' },
};
const ALL_PATHS: PathKey[] = ['b1', '12', '23', '3h'];
const PATH_LABELS: Record<PathKey, string> = { b1: 'B→1', '12': '1→2', '23': '2→3', '3h': '3→H' };

// ── Diamond component ──────────────────────────────────────────────────────────

function DiamondView({
  paths,
  scored,
  rbi,
  outNumber,
}: {
  paths: string[];
  scored: boolean;
  rbi: boolean;
  outNumber: number;
}) {
  function line(key: PathKey) {
    const { cx, cy, angle } = PATH_SPECS[key];
    const active = paths.includes(key);
    return (
      <View
        key={key}
        style={{
          position: 'absolute',
          width: LINE_LEN,
          height: LINE_W,
          backgroundColor: active ? '#1a5c2e' : '#ddd',
          top: cy - LINE_W / 2,
          left: cx - LINE_LEN / 2,
          transform: [{ rotate: angle }],
        }}
      />
    );
  }

  function base(pos: { x: number; y: number }, occupied: boolean, isHome = false) {
    const SIZE = isHome ? 8 : 7;
    return (
      <View
        style={{
          position: 'absolute',
          width: SIZE,
          height: SIZE,
          borderRadius: isHome ? 0 : SIZE / 2,
          backgroundColor: occupied ? '#1a5c2e' : '#ddd',
          top: pos.y - SIZE / 2,
          left: pos.x - SIZE / 2,
          transform: isHome ? [{ rotate: '45deg' }] : [],
        }}
      />
    );
  }

  const homeOccupied = scored;

  return (
    <View style={{ width: DS, height: DS }}>
      {ALL_PATHS.map(line)}
      {base(FIRST, false)}
      {base(SECOND, false)}
      {base(THIRD, false)}
      {base(HP, homeOccupied, true)}

      {/* Scored indicator */}
      {scored && (
        <View style={dStyles.scoredDot}>
          <Text style={dStyles.scoredText}>{rbi ? '●' : '○'}</Text>
        </View>
      )}

      {/* Out number circle */}
      {outNumber > 0 && (
        <View style={dStyles.outCircle}>
          <Text style={dStyles.outText}>{outNumber}</Text>
        </View>
      )}
    </View>
  );
}

const dStyles = StyleSheet.create({
  scoredDot: {
    position: 'absolute',
    top: DS / 2 - 8,
    left: DS / 2 - 8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoredText: { fontSize: 10, color: '#1a5c2e', fontWeight: '700' },
  outCircle: {
    position: 'absolute',
    top: DS / 2 - 8,
    left: DS / 2 - 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#c0392b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outText: { fontSize: 8, fontWeight: '800', color: '#c0392b' },
});

// ── At-bat cell ────────────────────────────────────────────────────────────────

const CELL_W = 88;
const CELL_H = 100;
const NAME_W = 76;
const INN_HEADER_H = 32;
const TOTALS_H = 28;

function AtBatCell({
  record,
  onPress,
  isAlt,
}: {
  record: AtBatRecord | null;
  onPress: () => void;
  isAlt: boolean;
}) {
  const bg = isAlt ? '#fafaf8' : '#fff';
  const scored = record?.scored ?? false;
  const outNumber = record?.outNumber ?? 0;

  return (
    <Pressable
      style={[cStyles.cell, { backgroundColor: bg }]}
      onPress={onPress}
    >
      <DiamondView
        paths={record?.paths ?? []}
        scored={scored}
        rbi={record?.rbi ?? false}
        outNumber={outNumber}
      />
      <Text style={[cStyles.catalyst, outNumber > 0 && cStyles.catalystOut]} numberOfLines={1}>
        {record?.catalyst ?? ''}
      </Text>
    </Pressable>
  );
}

const cStyles = StyleSheet.create({
  cell: {
    width: CELL_W,
    height: CELL_H,
    borderWidth: 0.5,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  catalyst: { fontSize: 11, fontWeight: '700', color: '#1a5c2e', marginBottom: 2 },
  catalystOut: { color: '#c0392b' },
});

// ── At-bat editing modal ───────────────────────────────────────────────────────

const QUICK_OUTCOMES: Array<{ label: string; catalyst: string; isHit?: boolean }> = [
  { label: 'Single', catalyst: 'S', isHit: true },
  { label: 'Double', catalyst: 'D', isHit: true },
  { label: 'Triple', catalyst: 'T', isHit: true },
  { label: 'Home Run', catalyst: 'H', isHit: true },
  { label: 'Walk', catalyst: 'W' },
  { label: 'Int Walk', catalyst: 'IW' },
  { label: 'HBP', catalyst: 'HP' },
  { label: 'Strikeout', catalyst: 'K' },
  { label: 'Error', catalyst: 'E' },
  { label: "Fielder's Ch", catalyst: 'FC' },
];

const MODIFIERS = ['/G', '/L', '/B', '/SH', '/SF', '/GDP', '/FDP'];

const FIELDER_POSITIONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

function AtBatModal({
  visible,
  inning,
  batterName,
  batterNumber,
  initial,
  onSave,
  onClose,
}: {
  visible: boolean;
  inning: number;
  batterName: string;
  batterNumber: string;
  initial: AtBatRecord | null;
  onSave: (record: AtBatRecord) => void;
  onClose: () => void;
}) {
  const [catalyst, setCatalyst] = useState('');
  const [paths, setPaths] = useState<string[]>([]);
  const [scored, setScored] = useState(false);
  const [rbi, setRbi] = useState(false);
  const [outNumber, setOutNumber] = useState(0);

  useEffect(() => {
    if (visible) {
      setCatalyst(initial?.catalyst ?? '');
      setPaths(initial?.paths ?? []);
      setScored(initial?.scored ?? false);
      setRbi(initial?.rbi ?? false);
      setOutNumber(initial?.outNumber ?? 0);
    }
  }, [visible, initial]);

  function applyQuick(outcome: (typeof QUICK_OUTCOMES)[0]) {
    setCatalyst(outcome.catalyst);
    // Auto-set batter-to-first path for hits/walks/HBP
    if (outcome.isHit || ['W', 'IW', 'HP'].includes(outcome.catalyst)) {
      setPaths((prev) => prev.includes('b1') ? prev : [...prev, 'b1']);
    }
    if (outcome.catalyst === 'H') {
      setPaths(['b1', '12', '23', '3h']);
      setScored(true);
      setRbi(true);
      setOutNumber(0);
    }
  }

  function appendFielder(pos: string) {
    setCatalyst((prev) => {
      // If last char is a digit, append '-pos'; otherwise append pos
      if (prev.length > 0 && /\d$/.test(prev)) return `${prev}-${pos}`;
      return `${prev}${pos}`;
    });
    setOutNumber((prev) => (prev === 0 ? 1 : prev)); // default to first out on field out
  }

  function appendModifier(mod: string) {
    setCatalyst((prev) => {
      if (prev.includes(mod)) return prev;
      return `${prev}${mod}`;
    });
  }

  function togglePath(key: PathKey) {
    setPaths((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  }

  function setResult(type: 'safe' | 'out1' | 'out2' | 'out3' | 'scored') {
    if (type === 'scored') {
      setScored(true);
      setOutNumber(0);
    } else if (type === 'safe') {
      setScored(false);
      setOutNumber(0);
    } else {
      setScored(false);
      setOutNumber(type === 'out1' ? 1 : type === 'out2' ? 2 : 3);
    }
  }

  function handleSave() {
    if (!catalyst.trim()) { Alert.alert('Enter a notation (e.g. K, S7, 43)'); return; }
    onSave({ catalyst: catalyst.trim(), paths, scored, rbi, outNumber });
  }

  const isHitForRbi = scored;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={mStyles.backdrop} onPress={onClose} />
      <View style={mStyles.sheet}>
        <View style={mStyles.handle} />
        <Text style={mStyles.title}>
          Inn {inning} · #{batterNumber} {batterName}
        </Text>

        {/* Quick outcome buttons */}
        <Text style={mStyles.sectionLabel}>Quick Outcome</Text>
        <View style={mStyles.chips}>
          {QUICK_OUTCOMES.map((o) => (
            <Pressable
              key={o.catalyst}
              style={[mStyles.chip, catalyst === o.catalyst && mStyles.chipActive]}
              onPress={() => applyQuick(o)}
            >
              <Text style={[mStyles.chipText, catalyst === o.catalyst && mStyles.chipTextActive]}>
                {o.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Field out builder */}
        <Text style={mStyles.sectionLabel}>Field Out — tap fielders to build code</Text>
        <View style={mStyles.fielderRow}>
          {FIELDER_POSITIONS.map((p) => (
            <Pressable key={p} style={mStyles.fielderBtn} onPress={() => appendFielder(p)}>
              <Text style={mStyles.fielderText}>{p}</Text>
            </Pressable>
          ))}
          <Pressable style={mStyles.fielderBtn} onPress={() => setCatalyst((c) => c.replace(/-?\d$/, ''))}>
            <Ionicons name="backspace-outline" size={14} color="#555" />
          </Pressable>
        </View>

        {/* Modifier buttons */}
        <View style={mStyles.fielderRow}>
          {MODIFIERS.map((m) => (
            <Pressable key={m} style={mStyles.modBtn} onPress={() => appendModifier(m)}>
              <Text style={mStyles.modText}>{m}</Text>
            </Pressable>
          ))}
        </View>

        {/* Notation text input */}
        <Text style={mStyles.sectionLabel}>Notation</Text>
        <TextInput
          style={mStyles.input}
          value={catalyst}
          onChangeText={setCatalyst}
          placeholder="e.g. S7, K, 43/G, W"
          autoCapitalize="characters"
        />

        {/* Basepath toggles */}
        <Text style={mStyles.sectionLabel}>Basepaths</Text>
        <View style={mStyles.pathRow}>
          {ALL_PATHS.map((key) => (
            <Pressable
              key={key}
              style={[mStyles.pathBtn, paths.includes(key) && mStyles.pathBtnActive]}
              onPress={() => togglePath(key)}
            >
              <Text style={[mStyles.pathText, paths.includes(key) && mStyles.pathTextActive]}>
                {PATH_LABELS[key]}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Result */}
        <Text style={mStyles.sectionLabel}>Result</Text>
        <View style={mStyles.resultRow}>
          {(['safe', 'out1', 'out2', 'out3', 'scored'] as const).map((r) => {
            const labels: Record<string, string> = {
              safe: 'Safe', out1: 'Out 1', out2: 'Out 2', out3: 'Out 3', scored: 'Scored',
            };
            const isActive =
              r === 'scored' ? scored
              : r === 'safe' ? (!scored && outNumber === 0)
              : r === 'out1' ? outNumber === 1
              : r === 'out2' ? outNumber === 2
              : outNumber === 3;
            return (
              <Pressable
                key={r}
                style={[mStyles.resultBtn, isActive && (r === 'scored' ? mStyles.resultBtnGreen : r.startsWith('out') ? mStyles.resultBtnRed : mStyles.resultBtnActive)]}
                onPress={() => setResult(r)}
              >
                <Text style={[mStyles.resultText, isActive && mStyles.resultTextActive]}>
                  {labels[r]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* RBI toggle — only when scored */}
        {isHitForRbi && (
          <View style={mStyles.rbiRow}>
            <Text style={mStyles.rbiLabel}>RBI?</Text>
            <Pressable style={[mStyles.rbiBtn, rbi && mStyles.rbiBtnActive]} onPress={() => setRbi((v) => !v)}>
              <Text style={[mStyles.rbiText, rbi && mStyles.rbiTextActive]}>
                {rbi ? '● RBI (circle)' : '○ No RBI (underline)'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Actions */}
        <View style={mStyles.actions}>
          <Pressable style={mStyles.cancelBtn} onPress={onClose}>
            <Text style={mStyles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable style={mStyles.saveBtn} onPress={handleSave}>
            <Text style={mStyles.saveText}>Save</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const mStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    gap: 8,
    maxHeight: '90%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#ddd', alignSelf: 'center', marginBottom: 4 },
  title: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
  chipActive: { backgroundColor: '#1a5c2e', borderColor: '#1a5c2e' },
  chipText: { fontSize: 12, color: '#555' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  fielderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fielderBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#f0f0ef',
    alignItems: 'center', justifyContent: 'center',
  },
  fielderText: { fontSize: 13, fontWeight: '600', color: '#333' },
  modBtn: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 7 },
  modText: { fontSize: 11, color: '#555' },
  input: {
    borderWidth: 1.5,
    borderColor: '#e0e0de',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    backgroundColor: '#fafaf8',
  },
  pathRow: { flexDirection: 'row', gap: 8 },
  pathBtn: { flex: 1, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  pathBtnActive: { backgroundColor: '#1a5c2e', borderColor: '#1a5c2e' },
  pathText: { fontSize: 11, fontWeight: '600', color: '#888' },
  pathTextActive: { color: '#fff' },
  resultRow: { flexDirection: 'row', gap: 6 },
  resultBtn: { flex: 1, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  resultBtnActive: { borderColor: '#1a5c2e', backgroundColor: '#edf6f0' },
  resultBtnGreen: { borderColor: '#1a5c2e', backgroundColor: '#1a5c2e' },
  resultBtnRed: { borderColor: '#c0392b', backgroundColor: '#c0392b' },
  resultText: { fontSize: 11, fontWeight: '600', color: '#888' },
  resultTextActive: { color: '#fff' },
  rbiRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rbiLabel: { fontSize: 12, fontWeight: '600', color: '#555' },
  rbiBtn: { flex: 1, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  rbiBtnActive: { borderColor: '#1a5c2e', backgroundColor: '#edf6f0' },
  rbiText: { fontSize: 12, fontWeight: '600', color: '#aaa' },
  rbiTextActive: { color: '#1a5c2e' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#888' },
  saveBtn: { flex: 2, backgroundColor: '#1a5c2e', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

// ── Main scoring screen ────────────────────────────────────────────────────────

export default function ScorecardScreen() {
  const { id: scorecardId } = useGlobalSearchParams<{ id: string }>();
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<{ inning: number; slot: number } | null>(null);

  useEffect(() => {
    if (!scorecardId) return;
    const unsub = subscribeToScorecard(scorecardId, (sc) => {
      setScorecard(sc);
      setLoading(false);
    });
    return unsub;
  }, [scorecardId]);

  const currentRecord = useMemo<AtBatRecord | null>(() => {
    if (!scorecard || !editTarget) return null;
    return scorecard.innings[editTarget.inning]?.atBats[editTarget.slot] ?? null;
  }, [scorecard, editTarget]);

  const handleSaveAtBat = useCallback(
    async (record: AtBatRecord) => {
      if (!scorecard || !editTarget) return;
      // Deep-copy innings, update the target cell
      const innings: ScorecardHalfInning[] = scorecard.innings.map((inn, iIdx) => {
        if (iIdx !== editTarget.inning) return inn;
        const atBats = [...(inn?.atBats ?? [])];
        atBats[editTarget.slot] = record;
        // Recompute totals
        const runs = atBats.filter((ab) => ab?.scored).length;
        const hits = atBats.filter((ab) => ab && ['S', 'D', 'T', 'H'].some((h) => ab.catalyst.startsWith(h))).length;
        return { ...inn, atBats, runs, hits };
      });
      setEditTarget(null);
      await updateScorecard(scorecardId, { innings });
    },
    [scorecard, editTarget, scorecardId]
  );

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#1a5c2e" />
      </View>
    );
  }

  if (!scorecard) {
    return (
      <View style={styles.loader}>
        <Text style={{ color: '#aaa' }}>Scorecard not found.</Text>
      </View>
    );
  }

  const { battingOrder, innings, maxInnings } = scorecard;
  const inningNums = Array.from({ length: maxInnings }, (_, i) => i + 1);

  // Column totals (R/H/E per inning)
  const totals = innings.map((inn) => ({
    runs: inn?.runs ?? 0,
    hits: inn?.hits ?? 0,
    errors: inn?.errors ?? 0,
  }));
  const grandR = totals.reduce((s, t) => s + t.runs, 0);
  const grandH = totals.reduce((s, t) => s + t.hits, 0);
  const grandE = totals.reduce((s, t) => s + t.errors, 0);

  const opponent = scorecard.isHome ? `vs ${scorecard.opponent}` : `@ ${scorecard.opponent}`;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)')}  style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#1a5c2e" />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{opponent}</Text>
          <Text style={styles.headerSub}>{scorecard.date} · {maxInnings} innings</Text>
        </View>
        <View style={styles.scoreBug}>
          <Text style={styles.scoreBugNum}>{grandR}</Text>
          <Text style={styles.scoreBugLabel}>R</Text>
        </View>
      </View>

      {/* Scrollable grid */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gridScroll}>
        <View>
          {/* Inning header row */}
          <View style={styles.gridRow}>
            <View style={[styles.nameCell, styles.headerCell]}>
              <Text style={styles.headerText}>Batter</Text>
            </View>
            {inningNums.map((n) => (
              <View key={n} style={[styles.innHeaderCell, styles.headerCell]}>
                <Text style={styles.headerText}>{n}</Text>
              </View>
            ))}
            {/* R/H/E headers */}
            {['R', 'H', 'E'].map((lbl) => (
              <View key={lbl} style={[styles.rheCell, styles.headerCell]}>
                <Text style={styles.headerText}>{lbl}</Text>
              </View>
            ))}
          </View>

          {/* Batter rows */}
          <ScrollView showsVerticalScrollIndicator={false}>
            {battingOrder.map((batter, slot) => {
              const rowR = innings.reduce((s, inn) => s + (inn?.atBats[slot]?.scored ? 1 : 0), 0);
              const rowH = innings.reduce((s, inn) => {
                const ab = inn?.atBats[slot];
                return s + (ab && ['S', 'D', 'T', 'H'].some((h) => ab.catalyst.startsWith(h)) ? 1 : 0);
              }, 0);
              return (
                <View key={slot} style={styles.gridRow}>
                  {/* Name cell */}
                  <View style={[styles.nameCell, slot % 2 === 1 && styles.altCell]}>
                    <Text style={styles.batNumText}>#{batter.number}</Text>
                    <Text style={styles.batNameText} numberOfLines={1}>{batter.name.split(' ')[0]}</Text>
                  </View>
                  {/* At-bat cells */}
                  {inningNums.map((_, iIdx) => (
                    <AtBatCell
                      key={iIdx}
                      record={innings[iIdx]?.atBats[slot] ?? null}
                      isAlt={slot % 2 === 1}
                      onPress={() => setEditTarget({ inning: iIdx, slot })}
                    />
                  ))}
                  {/* Row totals */}
                  <View style={[styles.rheCell, slot % 2 === 1 && styles.altCell]}>
                    <Text style={styles.rheNum}>{rowR}</Text>
                  </View>
                  <View style={[styles.rheCell, slot % 2 === 1 && styles.altCell]}>
                    <Text style={styles.rheNum}>{rowH}</Text>
                  </View>
                  <View style={[styles.rheCell, slot % 2 === 1 && styles.altCell]}>
                    <Text style={styles.rheNum}>—</Text>
                  </View>
                </View>
              );
            })}

            {/* Inning totals row */}
            <View style={[styles.gridRow, styles.totalsRow]}>
              <View style={[styles.nameCell, styles.totalsCell]}>
                <Text style={styles.totalsLabel}>Totals</Text>
              </View>
              {inningNums.map((_, iIdx) => (
                <View key={iIdx} style={[styles.innHeaderCell, styles.totalsCell]}>
                  <Text style={styles.totalsNum}>{totals[iIdx]?.runs ?? 0}</Text>
                </View>
              ))}
              <View style={[styles.rheCell, styles.totalsCell]}>
                <Text style={styles.totalsNum}>{grandR}</Text>
              </View>
              <View style={[styles.rheCell, styles.totalsCell]}>
                <Text style={styles.totalsNum}>{grandH}</Text>
              </View>
              <View style={[styles.rheCell, styles.totalsCell]}>
                <Text style={styles.totalsNum}>{grandE}</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </ScrollView>

      {/* At-bat editing modal */}
      {editTarget && (
        <AtBatModal
          visible={!!editTarget}
          inning={editTarget.inning + 1}
          batterName={battingOrder[editTarget.slot]?.name ?? ''}
          batterNumber={battingOrder[editTarget.slot]?.number ?? ''}
          initial={currentRecord}
          onSave={handleSaveAtBat}
          onClose={() => setEditTarget(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f5' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    gap: 8,
  },
  backBtn: { padding: 4 },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  headerSub: { fontSize: 12, color: '#aaa' },
  scoreBug: { alignItems: 'center', minWidth: 36 },
  scoreBugNum: { fontSize: 22, fontWeight: '800', color: '#1a5c2e' },
  scoreBugLabel: { fontSize: 10, color: '#aaa', fontWeight: '600' },
  gridScroll: { flex: 1 },
  gridRow: { flexDirection: 'row' },
  headerCell: { backgroundColor: '#1a5c2e', justifyContent: 'center', alignItems: 'center' },
  headerText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  nameCell: {
    width: NAME_W,
    height: CELL_H,
    borderWidth: 0.5,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  innHeaderCell: {
    width: CELL_W,
    height: INN_HEADER_H,
    borderWidth: 0.5,
    borderColor: '#1a5c2e',
  },
  altCell: { backgroundColor: '#fafaf8' },
  batNumText: { fontSize: 11, color: '#aaa', fontWeight: '600' },
  batNameText: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  rheCell: {
    width: 32,
    height: CELL_H,
    borderWidth: 0.5,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rheNum: { fontSize: 12, fontWeight: '600', color: '#1a1a1a' },
  totalsRow: {},
  totalsCell: { backgroundColor: '#f0f5f2', height: TOTALS_H },
  totalsLabel: { fontSize: 11, fontWeight: '700', color: '#1a5c2e', paddingLeft: 8 },
  totalsNum: { fontSize: 12, fontWeight: '700', color: '#1a5c2e' },
});
