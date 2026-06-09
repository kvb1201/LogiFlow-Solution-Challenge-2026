"""On-demand Supabase geometry backfill."""
from unittest.mock import patch

from app.services.geometry_backfill import ensure_geometry_for_leg, ensure_geometry_legs


def test_ensure_geometry_legs_dedupes_same_leg():
    legs = [
        {"train_number": "19038", "from_code": "TDL", "to_code": "KOTA"},
        {"train_number": "19038", "from": "TDL", "to": "KOTA"},
    ]
    with patch("app.services.geometry_backfill.ensure_geometry_for_leg") as mock_ensure:
        mock_ensure.return_value = {"ok": True}
        out = ensure_geometry_legs(legs)
    assert mock_ensure.call_count == 1
    assert len(out) == 1


def test_ensure_geometry_for_leg_reports_upsert_when_new():
    cached_row = {
        "geometry": [[78.1, 27.0], [78.2, 27.1], [75.8, 25.2]],
        "stops": [{"code": "TDL"}, {"code": "RKM"}, {"code": "KOTA"}],
        "source": "schedule",
        "point_count": 3,
    }
    detail = {
        "geometry": [[78.1, 27.0], [75.8, 25.2]],
        "stops": [{"code": "TDL"}, {"code": "KOTA"}],
        "point_count": 2,
        "source": "schedule",
    }

    with (
        patch("app.services.geometry_backfill.get_cached_geometry") as mock_get,
        patch(
            "app.pipelines.rail.geometry_builder.get_train_geometry_detail",
            return_value=detail,
        ),
    ):
        mock_get.side_effect = [None, cached_row]
        result = ensure_geometry_for_leg("19038", "TDL", "KOTA")

    assert result["ok"] is True
    assert result["upserted"] is True
    assert result["cached"] is False
    assert len(result["geometry"]) == 2
