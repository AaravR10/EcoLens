/**
 * Classification Service
 * Receives TF.js payload from the client and logs it for analytics/verification.
 */

class ClassificationService {
  async logClassification(label, confidence, municipality) {
    // In a prod environment, this might save the scan metadata into a data warehouse
    // to improve the model or track common items per municipality.
    // E.g., db.collection('scans').insertOne({ label, confidence, municipality, timestamp: new Date() })
    console.log(`[Classification Log] ${label} (${(confidence * 100).toFixed(1)}%) scanned in ${municipality}`);
    return true;
  }
}

export default new ClassificationService();
