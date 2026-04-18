import express from 'express';
import jwt from 'jsonwebtoken';
import geoService from '../services/geo.service.js';
import rulesService from '../services/rules.service.js';
import gamificationService from '../services/gamification.service.js';
import classificationService from '../services/classification.service.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// Helper to issue tokens
const issueToken = (res, points = 0, streak = 0) => {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24), // 24 hours
    points,
    streak
  };
  const token = jwt.sign(payload, JWT_SECRET);
  res.setHeader('X-Session-Token', token);
  return token;
};

// GET /rules/:city
router.get('/rules/:city', async (req, res) => {
  const { city } = req.params;
  const { material, lat, lng } = req.query;

  try {
    let resolvedCity = city;
    // If client passes lat/lng, map it to city using GeoService
    if (lat && lng) {
      resolvedCity = await geoService.getMunicipality(lat, lng);
    }
    
    // Check material rules against city
    const rules = await rulesService.getRule(resolvedCity, material);
    res.json({ city: resolvedCity, material, rules });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /classify
router.post('/classify', async (req, res) => {
  const { label, confidence, lat, lng } = req.body;
  if (req.isNewSession) issueToken(res);

  try {
    // Determine user's location based on phone GPS
    const municipality = await geoService.getMunicipality(lat, lng);
    
    // Log classifying act to the service (TF.js actually runs on client, this just tracks it)
    await classificationService.logClassification(label, confidence, municipality);
    
    // Fetch rules for that label and municipality
    const rules = await rulesService.getRule(municipality, label);
    
    res.json({
      success: true,
      material: label,
      confidence,
      municipality,
      rules
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /score
router.post('/score', async (req, res) => {
  const { userId, scanData } = req.body;
  // Use session if no userId is passed
  let currentPoints = req.user?.points || 0;
  let currentStreak = req.user?.streak || 0;

  try {
    const result = await gamificationService.processScan(userId, scanData, currentPoints, currentStreak);
    
    // Re-issue JWT with updated scores if using anonymous sessions
    if (!userId) {
      issueToken(res, result.newTotalPoints, result.newStreak);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
