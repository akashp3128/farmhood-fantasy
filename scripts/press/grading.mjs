import { round } from './utils.mjs';

export function gradePredictions(matchups) {
  const completed = matchups.filter((matchup) => matchup.winner);
  if (!completed.length) return null;
  const correct = completed.filter((matchup) => matchup.predictionCorrect).length;
  const scoreError = completed.reduce((sum, matchup) => sum + Math.abs(matchup.finalScoreA - matchup.projectedScoreA) + Math.abs(matchup.finalScoreB - matchup.projectedScoreB), 0) / (completed.length * 2);
  const marginError = completed.reduce((sum, matchup) => sum + Math.abs((matchup.finalScoreA - matchup.finalScoreB) - (matchup.projectedScoreA - matchup.projectedScoreB)), 0) / completed.length;
  const winnerAccuracy = correct / completed.length;
  const deskGrade = Math.round(winnerAccuracy * 70 + Math.max(0, 1 - scoreError / 30) * 15 + Math.max(0, 1 - marginError / 30) * 15);
  return {
    graded: completed.length,
    correctWinners: `${correct}/${completed.length}`,
    winnerAccuracy: `${Math.round(winnerAccuracy * 100)}%`,
    scoreError: round(scoreError, 1),
    marginError: round(marginError, 1),
    deskGrade: `${deskGrade}/100`
  };
}
