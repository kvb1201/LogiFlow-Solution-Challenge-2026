

from app.utils.coordinates import get_coords


def enrich_segment(segment):
    """
    Convert segment from simple string format → coordinate-rich format
    """

    frm = segment.get("from")
    to = segment.get("to")

    frm_coords = get_coords(frm)
    to_coords = get_coords(to)

    return {
        "mode": segment.get("mode"),
        "from": {
            "name": frm,
            "lat": frm_coords[0] if frm_coords else None,
            "lng": frm_coords[1] if frm_coords else None,
        },
        "to": {
            "name": to,
            "lat": to_coords[0] if to_coords else None,
            "lng": to_coords[1] if to_coords else None,
        },
    }