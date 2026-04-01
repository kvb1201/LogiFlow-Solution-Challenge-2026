city_coords = {
    "Surat": (21.1702, 72.8311),
    "Mumbai": (19.0760, 72.8777),
    "Vadodara": (22.3072, 73.1812),
    "Midpoint": (21.5, 73.0),
    "Port": (21.3, 72.9),
}


def get_coords(name):
    """
    Return latitude and longitude for a given location name.
    Falls back to a default India center if not found.
    """
    return city_coords.get(name, (20.5937, 78.9629))
