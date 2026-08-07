import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Colors from '@/shared/constants/colors';
import { Player } from '@/shared/lib/types';
import { calculateScores, getWinner, isTeamGame, getTeamScores } from '@/shared/lib/brisca/engine';
import { t } from '@/shared/i18n';
import { useLanguage } from '@shared/hooks/useLanguage';

interface ScoreBoardProps {
  players: Player[];
  myId?: string;
  onPlayAgain: () => void;
  onExit: () => void;
  endReason?: 'normal' | 'forfeit';
  forfeitedBy?: string;
}

/**
 * Full-screen backdrop for the result card.
 *
 * The card is centred in an overlay that clips, so anything taller than the
 * screen loses both ends — and Play again / Menu are the last thing in it. A 2v2
 * board with a forfeit note on a small phone is already close to that edge, and
 * a larger system font tips it over. Scrolling costs nothing while it fits:
 * `flexGrow: 1` keeps the card centred exactly as before.
 */
function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.container}>
      <View style={styles.overlay} />
      <ScrollView
        style={StyleSheet.absoluteFill}
        contentContainerStyle={styles.backdropContent}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export default function ScoreBoard({ players, myId, onPlayAgain, onExit, endReason, forfeitedBy }: ScoreBoardProps) {
  useLanguage();
  const teamMode = isTeamGame(players);

  if (teamMode) {
    return <TeamScoreBoard players={players} myId={myId} onPlayAgain={onPlayAgain} onExit={onExit} endReason={endReason} forfeitedBy={forfeitedBy} />;
  }

  const scores = calculateScores(players);
  const winner = getWinner(players);
  const isDraw = !winner && scores.length > 0 && scores[0].score === 60;
  const isForfeit = endReason === 'forfeit';

  return (
    <Backdrop>
      <View style={styles.modal}>
        <MaterialCommunityIcons
          name={isDraw ? 'handshake' : 'trophy'}
          size={48}
          color={Colors.gold}
        />
        <Text style={styles.title}>
          {isDraw ? t('score.draw') : t('score.playerWins', { name: winner?.name || '' })}
        </Text>
        {isForfeit && forfeitedBy ? (
          <Text style={styles.forfeitNote}>{t('score.forfeit', { name: forfeitedBy })}</Text>
        ) : null}

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
    </Backdrop>
  );
}

function TeamScoreBoard({ players, myId, onPlayAgain, onExit, endReason, forfeitedBy }: ScoreBoardProps) {
  useLanguage();
  const teamScores = getTeamScores(players);
  const isDraw = teamScores.length >= 2 && teamScores[0].score === teamScores[1].score;
  const winningTeam = isDraw ? null : teamScores[0];
  // Use myId to find the viewer; fall back to first non-AI for offline games
  const humanPlayer = myId ? players.find(p => p.id === myId) : players.find(p => !p.isAI);
  const humanTeam = humanPlayer?.team;
  const humanWon = winningTeam && humanTeam === winningTeam.team;
  const isForfeit = endReason === 'forfeit';

  return (
    <Backdrop>
      <View style={styles.modal}>
        <MaterialCommunityIcons
          name={isDraw ? 'handshake' : 'trophy'}
          size={48}
          color={Colors.gold}
        />
        <Text style={styles.title}>
          {isDraw ? t('score.draw') : humanWon ? t('score.teamWins') : t('score.youLose')}
        </Text>
        {isForfeit && forfeitedBy ? (
          <Text style={styles.forfeitNote}>{t('score.forfeit', { name: forfeitedBy })}</Text>
        ) : null}

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
    </Backdrop>
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
  backdropContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    // Vertical only: the card's width is a percentage of the container, so
    // horizontal padding here would quietly narrow it.
    paddingVertical: 24,
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
  forfeitNote: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginBottom: 12,
    marginTop: -10,
  },
  buttons: {
    flexDirection: 'column',
    gap: 10,
    width: '100%',
  },
  button: {
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
