import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Colors from '@/shared/constants/colors';
import { Player } from '@/shared/lib/types';
import { calculateScores, getWinner, isTeamGame, getTeamScores } from '@/shared/lib/brisca/engine';
import { t } from '@/shared/i18n';

interface ScoreBoardProps {
  players: Player[];
  onPlayAgain: () => void;
  onExit: () => void;
}

export default function ScoreBoard({ players, onPlayAgain, onExit }: ScoreBoardProps) {
  const teamMode = isTeamGame(players);

  if (teamMode) {
    return <TeamScoreBoard players={players} onPlayAgain={onPlayAgain} onExit={onExit} />;
  }

  const scores = calculateScores(players);
  const winner = getWinner(players);
  const isDraw = !winner && scores.length > 0 && scores[0].score === 60;

  return (
    <View style={styles.container}>
      <View style={styles.overlay} />
      <View style={styles.modal}>
        <MaterialCommunityIcons
          name={isDraw ? 'handshake' : 'trophy'}
          size={48}
          color={Colors.gold}
        />
        <Text style={styles.title}>
          {isDraw ? t('score.draw') : t('score.playerWins', { name: winner?.name || '' })}
        </Text>

        <View style={styles.scoreList}>
          {scores.map((s, i) => (
            <View key={s.id} style={[
              styles.scoreRow,
              i === 0 && !isDraw && styles.winnerRow,
            ]}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankNumber}>{i + 1}</Text>
              </View>
              <Text style={[styles.playerName, i === 0 && !isDraw && styles.winnerName]}>
                {s.name}
              </Text>
              <Text style={[styles.playerScore, i === 0 && !isDraw && styles.winnerScore]}>
                {s.score}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.totalNote}>{t('score.totalNote')}</Text>

        <View style={styles.buttons}>
          <Pressable
            style={({ pressed }) => [styles.button, styles.primaryButton, pressed && { opacity: 0.8 }]}
            onPress={onPlayAgain}
            testID="play-again-btn"
          >
            <MaterialCommunityIcons name="refresh" size={20} color={Colors.textDark} />
            <Text style={styles.primaryButtonText}>{t('score.playAgain')}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && { opacity: 0.8 }]}
            onPress={onExit}
            testID="exit-btn"
          >
            <MaterialCommunityIcons name="home" size={20} color={Colors.white} />
            <Text style={styles.secondaryButtonText}>{t('score.menu')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function TeamScoreBoard({ players, onPlayAgain, onExit }: ScoreBoardProps) {
  const teamScores = getTeamScores(players);
  const isDraw = teamScores.length >= 2 && teamScores[0].score === teamScores[1].score;
  const winningTeam = isDraw ? null : teamScores[0];
  const humanPlayer = players.find(p => !p.isAI);
  const humanTeam = humanPlayer?.team;
  const humanWon = winningTeam && humanTeam === winningTeam.team;

  return (
    <View style={styles.container}>
      <View style={styles.overlay} />
      <View style={styles.modal}>
        <MaterialCommunityIcons
          name={isDraw ? 'handshake' : 'trophy'}
          size={48}
          color={Colors.gold}
        />
        <Text style={styles.title}>
          {isDraw ? t('score.draw') : humanWon ? t('score.teamWins') : t('score.youLose')}
        </Text>

        <View style={styles.scoreList}>
          {teamScores.map((ts, i) => {
            const isWinner = i === 0 && !isDraw;
            const isMyTeam = ts.team === humanTeam;
            return (
              <View key={ts.team} style={[
                styles.scoreRow,
                isWinner && styles.winnerRow,
              ]}>
                <View style={[styles.rankBadge, isMyTeam && styles.myTeamBadge]}>
                  <Text style={styles.rankNumber}>{isMyTeam ? '★' : `${i + 1}`}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.playerName, isWinner && styles.winnerName]}>
                    {ts.names.join(' & ')}
                  </Text>
                </View>
                <Text style={[styles.playerScore, isWinner && styles.winnerScore]}>
                  {ts.score}
                </Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.totalNote}>{t('score.totalNote')}</Text>

        <View style={styles.buttons}>
          <Pressable
            style={({ pressed }) => [styles.button, styles.primaryButton, pressed && { opacity: 0.8 }]}
            onPress={onPlayAgain}
            testID="play-again-btn"
          >
            <MaterialCommunityIcons name="refresh" size={20} color={Colors.textDark} />
            <Text style={styles.primaryButtonText}>{t('score.playAgain')}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && { opacity: 0.8 }]}
            onPress={onExit}
            testID="exit-btn"
          >
            <MaterialCommunityIcons name="home" size={20} color={Colors.white} />
            <Text style={styles.secondaryButtonText}>{t('score.menu')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
  },
  modal: {
    backgroundColor: Colors.backgroundDark,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    width: '85%',
    maxWidth: 340,
    borderWidth: 2,
    borderColor: Colors.gold,
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    color: Colors.gold,
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    marginTop: 12,
    marginBottom: 20,
    textAlign: 'center',
  },
  scoreList: {
    width: '100%',
    gap: 8,
    marginBottom: 12,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.whiteAlpha2,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  winnerRow: {
    backgroundColor: 'rgba(212, 168, 67, 0.15)',
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.whiteAlpha,
    justifyContent: 'center',
    alignItems: 'center',
  },
  myTeamBadge: {
    backgroundColor: 'rgba(212, 168, 67, 0.3)',
  },
  rankNumber: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  playerName: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  winnerName: {
    color: Colors.gold,
    fontFamily: 'Inter_700Bold',
  },
  playerScore: {
    color: Colors.textSecondary,
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  winnerScore: {
    color: Colors.gold,
  },
  totalNote: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginBottom: 20,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryButton: {
    backgroundColor: Colors.gold,
  },
  secondaryButton: {
    backgroundColor: Colors.whiteAlpha,
    borderWidth: 1,
    borderColor: Colors.whiteAlpha,
  },
  primaryButtonText: {
    color: Colors.textDark,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  secondaryButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
});
