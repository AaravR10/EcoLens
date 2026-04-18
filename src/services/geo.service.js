/**
 * Geo Service
 * Mocks the Google Maps Geocoding API to resolve a municipality from Lat/Lng.
 */

class GeoService {
  async getMunicipality(lat, lng) {
    // In a real application, we would call the Google Maps API:
    // const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.GOOGLE_MAPS_KEY}`);
    // return parsedMunicipalityName

    // Mock implementation for MVP
    lat = parseFloat(lat);
    
    // Just a dummy logic to switch between cities based on latitude
    if (lat > 47) {
      return 'Seattle'; // e.g., 47.6062
    } else {
      return 'Portland'; // e.g., 45.5152
    }
  }
}

export default new GeoService();
