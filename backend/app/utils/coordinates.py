import json
import urllib.request
import urllib.parse

# Cache to prevent spamming the geocoding API
city_coords_cache = {
    "Delhi": (28.6139, 77.2090),
    "Mumbai": (19.0760, 72.8777),
    "Surat": (21.1702, 72.8311),
    "Vadodara": (22.3072, 73.1812),
    "Bengaluru": (12.9716, 77.5946),
    "Chennai": (13.0827, 80.2707),
    "Hyderabad": (17.3850, 78.4867),
    "Kolkata": (22.5726, 88.3639),
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

midpoint_name_cache = {}

def get_dynamic_midpoint(source: str, destination: str):
    """
    Computes geographical center between source and destination, 
    and reverse geocodes it to find a realistic intermediate city/town.
    """
    key = f"{source}-{destination}"
    if key in midpoint_name_cache:
        return midpoint_name_cache[key]
        
    s_lat, s_lon = get_coords(source)
    d_lat, d_lon = get_coords(destination)
    
    mid_lat = (s_lat + d_lat) / 2
    mid_lon = (s_lon + d_lon) / 2
    
    try:
        url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={mid_lat}&lon={mid_lon}&zoom=10"
        req = urllib.request.Request(url, headers={'User-Agent': 'LogiFlow-AI-Agent'})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            address = data.get('address', {})
            # try to extract the most logical town/city/state name
            city_name = address.get('city') or address.get('town') or address.get('county') or address.get('state') or "Intermediate Hub"
            midpoint_name_cache[key] = city_name
            # Put its explicit coordinate in the coords cache so it precisely matches the calculated halfway
            city_coords_cache[city_name] = (mid_lat, mid_lon)
            return city_name
    except Exception as e:
        print(f"Reverse geocode failed for midpoint of {source}-{destination}: {e}")
        
    return "Central Hub"
