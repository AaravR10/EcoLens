import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';

/**
 * Rules Engine Service
 * Executes cache-first lookup for rules (city + material).
 */

class RulesService {
  constructor() {
    this.prisma = new PrismaClient();
    this.redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    this.redis.on('error', (err) => console.log('Redis Client Error', err));
    
    // Don't connect in constructor for MVP script simplicity, but in prod we would:
    // this.redis.connect().catch(console.error);
    this.redisConnected = false;
  }

  async connectRedis() {
    if (!this.redisConnected) {
      try {
        await this.redis.connect();
        this.redisConnected = true;
      } catch (err) {
        console.warn('Could not connect to Redis, falling back to DB only');
      }
    }
  }

  async getRule(city, material) {
    // Attempt cache lookup
    const cacheKey = `rule:${city}:${material}`;
    
    await this.connectRedis();
    if (this.redisConnected) {
      const cachedRule = await this.redis.get(cacheKey);
      if (cachedRule) {
        return JSON.parse(cachedRule);
      }
    }

    // Cache miss or Redis unavailable, hit PostgreSQL
    try {
      const rule = await this.prisma.rule.findUnique({
        where: {
          city_material: {
            city: city,
            material: material
          }
        }
      });

      if (rule && this.redisConnected) {
        // Cache for 24h
        await this.redis.setEx(cacheKey, 86400, JSON.stringify(rule));
      }

      // If rule is not found, return a default unknown state
      return rule || { recyclable: false, note: "Unknown material in this municipality." };
    } catch (dbError) {
      // Mock data fallback if DB isn't running for MVP demo
      if (city === 'Seattle' && material.includes('PET')) {
        return { recyclable: true, note: 'Recyclable in Seattle' };
      } else if (city === 'Portland' && material.includes('PET')) {
        return { recyclable: false, note: 'TRASH in Portland' };
      }
      return { recyclable: false, note: "Database connection failed, assuming trash." };
    }
  }
}

export default new RulesService();
