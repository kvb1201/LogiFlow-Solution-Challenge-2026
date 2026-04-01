

from app.utils.coordinates import get_coords


def enrich_segment(segment):
    """
    Convert segment from simple string format → coordinate-rich format
    """

    frm = segment.get("from")
    to = segment.get("to")

    frm_lat, frm_lng = get_coords(frm)
    to_lat, to_lng = get_coords(to)

    return {
        "mode": segment.get("mode"),
        "from": {
            "name": frm,
            "lat": frm_lat,
            "lng": frm_lng,
        },
        "to": {
            "name": to,
            "lat": to_lat,
            "lng": to_lng,
        },
    }