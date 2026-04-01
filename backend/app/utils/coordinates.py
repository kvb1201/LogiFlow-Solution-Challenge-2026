import json
import urllib.request
import urllib.parse

# Cache to prevent spamming the geocoding API
city_coords_cache = {
    "Mumbai": (19.0760, 72.8777),
    "Surat": (21.1702, 72.8311),
    "Vadodara": (22.3072, 73.1812),
    "Midpoint": (21.5, 73.0),
    "Port": (21.3, 72.9)
}

def get_coords(name):
    """
    Return latitude and longitude for a given location name dynamically using Nominatim.
    Falls back to a default India center if not found.
    """
    if not name:
        return (20.5937, 78.9629)
        
    # Check cache first
    if name in city_coords_cache:
        return city_coords_cache[name]
    
    # Ignore fallback terms that aren't real places
    if name.lower() in ['midpoint', 'port', 'express hub', 'central depot']:
        return (20.5937, 78.9629) # Fallback center of India
        
    try:
        # Ask OpenStreetMap for the real-world coordinates! (Free Geocoding)
        query = urllib.parse.quote(name)
        url = f"https://nominatim.openstreetmap.org/search?format=json&q={query}&limit=1"
        req = urllib.request.Request(url, headers={'User-Agent': 'LogiFlow-AI-Agent'})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            if data and len(data) > 0:
                lat = float(data[0]['lat'])
                lon = float(data[0]['lon'])
                city_coords_cache[name] = (lat, lon)
                return (lat, lon)
    except Exception as e:
        print(f"Geocoding failed for {name}: {e}")
        
    return (20.5937, 78.9629) # Fallback if API fails or city not found
