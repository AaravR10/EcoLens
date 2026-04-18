/**
 * Gamification Service
 * Handles logic for points, streaks, and badges based on user scans.
 */
import { PrismaClient } from '@prisma/client';

class GamificationService {
  constructor() {
    this.prisma = new PrismaClient();
  }

  async processScan(userId, scanData, currentPoints, currentStreak) {
    const POINTS_PER_SCAN = 10;
    const STREAK_BONUS = 5;

    let pointsAwarded = POINTS_PER_SCAN;
    let newStreak = currentStreak + 1;

    // Apply streak bonus
    if (newStreak % 5 === 0) {
      pointsAwarded += STREAK_BONUS;
    }

    const newTotalPoints = currentPoints + pointsAwarded;

    // If a userId (from a logged-in account, mapping beyond MVP anonymous session) is given,
    // we would update the store
    if (userId) {
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            points: newTotalPoints,
            streak: newStreak
            // We could also check logic for badges here
          }
        });
      } catch (e) {
        console.warn('Could not update user points in DB - MVP mode might not have Prisma DB running');
      }
    }

    return {
      awarded: pointsAwarded,
      newTotalPoints,
      newStreak,
      message: `You earned ${pointsAwarded} points!${newStreak % 5 === 0 ? ' Streak bonus!' : ''}`
    };
  }
}

export default new GamificationService();
