import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { Pressable as GHPressable } from 'react-native-gesture-handler';
import { Player } from '../types';

export function BattingOrderView({
  players,
  allPlayers,
  battingOrder,
  absentIds,
  benchedIds = [],
  isAdmin = false,
  onMove,
  onToggleBench,
}: {
  players: Player[];
  allPlayers: Player[];
  battingOrder: string[];
  absentIds: string[];
  benchedIds?: string[];
  isAdmin?: boolean;
  onMove: (from: number, to: number) => void;
  onToggleBench?: (playerId: string) => void;
}) {
  const absentPlayers = battingOrder
    .map((id) => allPlayers.find((p) => p.id === id))
    .filter((p): p is Player => !!p && absentIds.includes(p.id));

  const benchedPlayers = battingOrder
    .map((id) => allPlayers.find((p) => p.id === id))
    .filter((p): p is Player => !!p && benchedIds.includes(p.id));

  if (allPlayers.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="list-outline" size={48} color="#ccc" />
        <Text style={styles.emptyText}>Add players on the Roster tab to set your batting order.</Text>
      </View>
    );
  }

  if (players.length === 0) {
    return (
      <View style={[styles.empty, { flex: 0, paddingVertical: 24 }]}>
        <Text style={styles.emptyText}>No active players. Manage availability in the Schedule tab.</Text>
      </View>
    );
  }

  function renderItem({ item: player, getIndex, drag, isActive }: RenderItemParams<Player>) {
    const index = getIndex() ?? 0;
    return (
      <ScaleDecorator activeScale={1.03}>
        <GHPressable
          onLongPress={drag}
          delayLongPress={150}
          style={[styles.orderRow, isActive && styles.orderRowDragging]}
        >
          <Ionicons name="reorder-three-outline" size={20} color="#ccc" style={styles.dragHandle} />
          <Text style={styles.orderNum}>{index + 1}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeNum}>#{player.number || '—'}</Text>
          </View>
          <Text style={styles.playerName}>{player.name}</Text>
          {isAdmin && onToggleBench && (
            <Pressable onPress={() => onToggleBench(player.id)} hitSlop={8} style={styles.benchBtn}>
              <Ionicons name="arrow-down-circle-outline" size={20} color="#aaa" />
            </Pressable>
          )}
        </GHPressable>
      </ScaleDecorator>
    );
  }

  return (
    <DraggableFlatList
      data={players}
      keyExtractor={(p) => p.id}
      style={{ flex: 1 }}
      contentContainerStyle={styles.list}
      onDragEnd={({ from, to }) => {
        const realFrom = battingOrder.indexOf(players[from].id);
        const realTo = battingOrder.indexOf(players[to].id);
        onMove(realFrom, realTo);
      }}
      renderItem={renderItem}
      ListFooterComponent={
        benchedPlayers.length > 0 || absentPlayers.length > 0 ? (
          <View>
            {benchedPlayers.length > 0 && (
              <>
                <Text style={styles.sectionHeader}>Bench ({benchedPlayers.length})</Text>
                {benchedPlayers.map((player) => (
                  <View key={player.id} style={[styles.orderRow, styles.orderRowBenched]}>
                    <View style={{ width: 28 }} />
                    <Text style={[styles.orderNum, { color: '#aaa' }]}>B</Text>
                    <View style={[styles.badge, styles.badgeBenched]}>
                      <Text style={styles.badgeNum}>#{player.number || '—'}</Text>
                    </View>
                    <Text style={[styles.playerName, { color: '#888' }]}>{player.name}</Text>
                    {isAdmin && onToggleBench && (
                      <Pressable onPress={() => onToggleBench(player.id)} hitSlop={8} style={styles.benchBtn}>
                        <Ionicons name="arrow-up-circle-outline" size={20} color="#1a5c2e" />
                      </Pressable>
                    )}
                  </View>
                ))}
              </>
            )}
            {absentPlayers.length > 0 && (
              <>
                <Text style={styles.sectionHeader}>Not attending ({absentPlayers.length})</Text>
                {absentPlayers.map((player) => (
                  <View key={player.id} style={[styles.orderRow, styles.orderRowAbsent]}>
                    <View style={{ width: 28 }} />
                    <Text style={[styles.orderNum, { color: '#ccc' }]}>—</Text>
                    <View style={[styles.badge, styles.badgeAbsent]}>
                      <Text style={styles.badgeNum}>#{player.number || '—'}</Text>
                    </View>
                    <Text style={[styles.playerName, { color: '#aaa' }]}>{player.name}</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  emptyText: { color: '#aaa', fontSize: 15, textAlign: 'center' },
  orderRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  orderRowAbsent: { backgroundColor: '#fafaf8', opacity: 0.6 },
  orderRowDragging: {
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  orderNum: { width: 24, fontSize: 15, fontWeight: '700', color: '#1a5c2e' },
  badge: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#1a5c2e',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  badgeAbsent: { backgroundColor: '#ccc' },
  badgeNum: { color: '#fff', fontWeight: '700', fontSize: 12 },
  playerName: { flex: 1, fontSize: 15, fontWeight: '500', color: '#1a1a1a' },
  dragHandle: { marginRight: 4 },
  sectionHeader: {
    fontSize: 11, fontWeight: '700', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingTop: 14, paddingBottom: 4, paddingHorizontal: 4,
  },
  orderRowBenched: { backgroundColor: '#f0f7f2', opacity: 0.85 },
  badgeBenched: { backgroundColor: '#6aab82' },
  benchBtn: { paddingLeft: 8 },
});
