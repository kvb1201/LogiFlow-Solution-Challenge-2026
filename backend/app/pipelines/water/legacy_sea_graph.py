"""
Curated sea-lane seeds from the original 47-port graph.
Used as high-quality corridor edges when building the expanded network.
"""
from __future__ import annotations

LEGACY_PORT_SUPPLEMENTS: list[dict] = [
    {
        "id": "port411",
        "name": "Jebel Ali Port (Dubai), UAE",
        "lat": 25.013,
        "lng": 55.061,
        "coast": "international",
        "region": "middle_east",
        "infrastructure_quality": 0.96,
        "customs_hours": 5.0,
        "piracy_risk": 0.04,
        "base_congestion": 0.38,
        "base_security_risk": 0.13,
        "import_share": 70.0,
        "vessel_count_total": 8900,
        "locode": "AE JEA"
    },
    {
        "id": "port566",
        "name": "Jeddah Islamic Port, Saudi Arabia",
        "lat": 21.486,
        "lng": 39.188,
        "coast": "international",
        "region": "middle_east",
        "infrastructure_quality": 0.87,
        "customs_hours": 8.0,
        "piracy_risk": 0.12,
        "base_congestion": 0.42,
        "base_security_risk": 0.22,
        "import_share": 28.0,
        "vessel_count_total": 4500,
        "locode": "SA JED"
    },
    {
        "id": "port1161",
        "name": "Port of Salalah, Oman",
        "lat": 16.95,
        "lng": 54.01,
        "coast": "international",
        "region": "middle_east",
        "infrastructure_quality": 0.89,
        "customs_hours": 6.0,
        "piracy_risk": 0.1,
        "base_congestion": 0.31,
        "base_security_risk": 0.17,
        "import_share": 40.0,
        "vessel_count_total": 2100,
        "locode": "OM SLL"
    },
    {
        "id": "port909",
        "name": "Port Said (Suez Canal Gateway), Egypt",
        "lat": 31.26,
        "lng": 32.31,
        "coast": "international",
        "region": "middle_east",
        "infrastructure_quality": 0.84,
        "customs_hours": 10.0,
        "piracy_risk": 0.07,
        "base_congestion": 0.46,
        "base_security_risk": 0.2,
        "import_share": 12.0,
        "vessel_count_total": 3200,
        "locode": "EG PSD"
    },
    {
        "id": "colombo",
        "name": "Port of Colombo, Sri Lanka",
        "lat": 6.935,
        "lng": 79.848,
        "coast": "international",
        "region": "south_asia",
        "infrastructure_quality": 0.88,
        "customs_hours": 7.0,
        "piracy_risk": 0.02,
        "base_congestion": 0.42,
        "base_security_risk": 0.14,
        "import_share": 65.0,
        "vessel_count_total": 4200,
        "locode": "LK CMB"
    },
    {
        "id": "port648",
        "name": "Port Klang, Malaysia",
        "lat": 3.0,
        "lng": 101.35,
        "coast": "international",
        "region": "southeast_asia",
        "infrastructure_quality": 0.89,
        "customs_hours": 6.0,
        "piracy_risk": 0.03,
        "base_congestion": 0.42,
        "base_security_risk": 0.13,
        "import_share": 35.0,
        "vessel_count_total": 5800,
        "locode": "MY PKG"
    },
    {
        "id": "port1074",
        "name": "Tanjung Pelepas Port, Malaysia",
        "lat": 1.363,
        "lng": 103.553,
        "coast": "international",
        "region": "southeast_asia",
        "infrastructure_quality": 0.91,
        "customs_hours": 5.0,
        "piracy_risk": 0.02,
        "base_congestion": 0.38,
        "base_security_risk": 0.11,
        "import_share": 15.0,
        "vessel_count_total": 3100,
        "locode": "MY PTP"
    },
    {
        "id": "port171",
        "name": "Ho Chi Minh City Port (Cat Lai), Vietnam",
        "lat": 10.76,
        "lng": 106.79,
        "coast": "international",
        "region": "southeast_asia",
        "infrastructure_quality": 0.82,
        "customs_hours": 8.0,
        "piracy_risk": 0.02,
        "base_congestion": 0.44,
        "base_security_risk": 0.15,
        "import_share": 20.0,
        "vessel_count_total": 2900,
        "locode": "VN SGN"
    },
    {
        "id": "port568",
        "name": "Jakarta (Tanjung Priok), Indonesia",
        "lat": -6.101,
        "lng": 106.87,
        "coast": "international",
        "region": "southeast_asia",
        "infrastructure_quality": 0.83,
        "customs_hours": 8.0,
        "piracy_risk": 0.04,
        "base_congestion": 0.45,
        "base_security_risk": 0.16,
        "import_share": 30.0,
        "vessel_count_total": 4100,
        "locode": "ID JKT"
    },
    {
        "id": "port485",
        "name": "Port of Tokyo, Japan",
        "lat": 35.63,
        "lng": 139.78,
        "coast": "international",
        "region": "east_asia",
        "infrastructure_quality": 0.93,
        "customs_hours": 5.0,
        "piracy_risk": 0.01,
        "base_congestion": 0.43,
        "base_security_risk": 0.1,
        "import_share": 12.0,
        "vessel_count_total": 4800,
        "locode": "JP TYO"
    }
]

LEGACY_SEA_LANES: dict[str, list[str]] = {
    "port540": [
        "port777",
        "port776"
    ],
    "port777": [
        "port540",
        "port776",
        "port411",
        "port2039",
        "port1199"
    ],
    "port2039": [
        "port777",
        "port271",
        "port907"
    ],
    "port271": [
        "port2039",
        "port907"
    ],
    "port907": [
        "port271",
        "port776",
        "port511"
    ],
    "port776": [
        "port777",
        "port540",
        "port907",
        "port511",
        "port709",
        "port411",
        "port583",
        "port1201"
    ],
    "port511": [
        "port776",
        "port709"
    ],
    "port709": [
        "port776",
        "port511",
        "port811"
    ],
    "port811": [
        "port709",
        "port583"
    ],
    "port583": [
        "port811",
        "port1331",
        "port235",
        "colombo",
        "port1201"
    ],
    "port1199": [
        "port777",
        "port540"
    ],
    "port1331": [
        "port583",
        "port235"
    ],
    "port235": [
        "port1331",
        "port534",
        "port583",
        "port1367",
        "port2038",
        "port599",
        "colombo",
        "port1201"
    ],
    "port2038": [
        "port235",
        "port534",
        "port599"
    ],
    "port534": [
        "port235",
        "port2038",
        "port599"
    ],
    "port599": [
        "port534",
        "port235",
        "port529",
        "port1367"
    ],
    "port529": [
        "port599",
        "port1367"
    ],
    "port1367": [
        "port529",
        "port599",
        "port883",
        "port1201"
    ],
    "port883": [
        "port1367",
        "port290",
        "port442"
    ],
    "port290": [
        "port883",
        "port442"
    ],
    "port442": [
        "port290",
        "port883",
        "port207",
        "port1201"
    ],
    "port207": [
        "port442",
        "port1201"
    ],
    "colombo": [
        "port583",
        "port235",
        "port1201",
        "port648",
        "port411",
        "port1161"
    ],
    "port411": [
        "port777",
        "port776",
        "port1161",
        "port566",
        "port909",
        "port1201",
        "colombo"
    ],
    "port566": [
        "port411",
        "port1161",
        "port909"
    ],
    "port1161": [
        "port411",
        "port566",
        "port1201",
        "colombo"
    ],
    "port909": [
        "port566",
        "port23",
        "port1114",
        "port57",
        "port446",
        "port411"
    ],
    "port23": [
        "port909"
    ],
    "port1201": [
        "port583",
        "port235",
        "port442",
        "port207",
        "port648",
        "port1074",
        "port572",
        "port171",
        "port568",
        "port1188",
        "port474",
        "port824",
        "port1161",
        "port411"
    ],
    "port648": [
        "port1201",
        "port1074",
        "colombo"
    ],
    "port1074": [
        "port648",
        "port1201"
    ],
    "port572": [
        "port1201",
        "port171"
    ],
    "port171": [
        "port572",
        "port568",
        "port474",
        "port1188"
    ],
    "port568": [
        "port1201",
        "port171"
    ],
    "port1188": [
        "port1201",
        "port824",
        "port474",
        "port171",
        "port1065"
    ],
    "port824": [
        "port1201",
        "port1188",
        "port474"
    ],
    "port474": [
        "port1201",
        "port1188",
        "port824",
        "port171",
        "port1065"
    ],
    "port1065": [
        "port474",
        "port1188",
        "port485"
    ],
    "port485": [
        "port1065"
    ],
    "port1114": [
        "port909",
        "port57",
        "port446",
        "port1265"
    ],
    "port57": [
        "port1114",
        "port909",
        "port446"
    ],
    "port446": [
        "port1114",
        "port57",
        "port909"
    ],
    "port504": [
        "port909",
        "port23"
    ],
    "port311": [
        "port1265",
        "port1201",
        "port1114",
        "port57"
    ],
    "port1265": [
        "port909",
        "port1114",
        "port311"
    ],
    "port481": [
        "port1160",
        "port1114",
        "port57"
    ],
    "port1160": [
        "port481",
        "port1114"
    ]
}

_LEGACY_ROUTE_CHOKEPOINTS_RAW: dict[str, list[str]] = {
    "port776|port411": [
        "chokepoint6"
    ],
    "port777|port411": [
        "chokepoint6"
    ],
    "port540|port411": [
        "chokepoint6"
    ],
    "port583|port411": [
        "chokepoint6"
    ],
    "port776|port1161": [
        "chokepoint6"
    ],
    "port583|port1161": [
        "chokepoint6"
    ],
    "colombo|port411": [
        "chokepoint6"
    ],
    "colombo|port1161": [
        "chokepoint6"
    ],
    "port1161|port776": [
        "chokepoint6"
    ],
    "port1161|port777": [
        "chokepoint6"
    ],
    "port411|port776": [
        "chokepoint6"
    ],
    "port411|port777": [
        "chokepoint6"
    ],
    "port411|port540": [
        "chokepoint6"
    ],
    "port411|port583": [
        "chokepoint6"
    ],
    "port411|colombo": [
        "chokepoint6"
    ],
    "port1161|colombo": [
        "chokepoint6"
    ],
    "port411|port909": [
        "chokepoint4",
        "chokepoint1"
    ],
    "port411|port1114": [
        "chokepoint4",
        "chokepoint1",
        "chokepoint8"
    ],
    "port411|port57": [
        "chokepoint4",
        "chokepoint1",
        "chokepoint8"
    ],
    "port411|port446": [
        "chokepoint4",
        "chokepoint1",
        "chokepoint8"
    ],
    "port566|port909": [
        "chokepoint4",
        "chokepoint1"
    ],
    "port566|port1114": [
        "chokepoint4",
        "chokepoint1",
        "chokepoint8"
    ],
    "port1161|port909": [
        "chokepoint4",
        "chokepoint1"
    ],
    "port1161|port1114": [
        "chokepoint4",
        "chokepoint1",
        "chokepoint8"
    ],
    "port909|port411": [
        "chokepoint1",
        "chokepoint4"
    ],
    "port1114|port411": [
        "chokepoint8",
        "chokepoint1",
        "chokepoint4"
    ],
    "port776|port1114": [
        "chokepoint6",
        "chokepoint4",
        "chokepoint1",
        "chokepoint8"
    ],
    "port777|port1114": [
        "chokepoint6",
        "chokepoint4",
        "chokepoint1",
        "chokepoint8"
    ],
    "port235|port1114": [
        "chokepoint5",
        "chokepoint4",
        "chokepoint1",
        "chokepoint8"
    ],
    "port583|port1114": [
        "chokepoint4",
        "chokepoint1",
        "chokepoint8"
    ],
    "port1367|port1114": [
        "chokepoint5",
        "chokepoint4",
        "chokepoint1",
        "chokepoint8"
    ],
    "port583|port1201": [
        "chokepoint5"
    ],
    "port235|port1201": [
        "chokepoint5"
    ],
    "port1367|port1201": [
        "chokepoint5"
    ],
    "port442|port1201": [
        "chokepoint5"
    ],
    "port207|port1201": [
        "chokepoint5"
    ],
    "port1331|port1201": [
        "chokepoint5"
    ],
    "colombo|port1201": [
        "chokepoint5"
    ],
    "port776|port1201": [
        "chokepoint5"
    ],
    "port777|port1201": [
        "chokepoint5"
    ],
    "port1201|port583": [
        "chokepoint5"
    ],
    "port1201|port235": [
        "chokepoint5"
    ],
    "port1201|port776": [
        "chokepoint5"
    ],
    "port1201|port1188": [
        "chokepoint11"
    ],
    "port1201|port824": [
        "chokepoint11"
    ],
    "port1201|port474": [
        "chokepoint11"
    ],
    "port1201|port1065": [
        "chokepoint11",
        "chokepoint12"
    ],
    "port1201|port485": [
        "chokepoint11",
        "chokepoint12"
    ],
    "port474|port1065": [
        "chokepoint12"
    ],
    "port1188|port1065": [
        "chokepoint12"
    ],
    "port1188|port1201": [
        "chokepoint11"
    ],
    "port474|port1201": [
        "chokepoint11"
    ],
    "port235|port1188": [
        "chokepoint5",
        "chokepoint11"
    ],
    "port583|port1188": [
        "chokepoint5",
        "chokepoint11"
    ],
    "port583|port474": [
        "chokepoint5",
        "chokepoint11"
    ],
    "port235|port474": [
        "chokepoint5",
        "chokepoint11"
    ],
    "port235|port1065": [
        "chokepoint5",
        "chokepoint11",
        "chokepoint12"
    ],
    "port311|port1114": [
        "chokepoint7"
    ],
    "port311|port57": [
        "chokepoint7"
    ],
    "port311|port446": [
        "chokepoint7"
    ],
    "port311|port1201": [
        "chokepoint7"
    ],
    "port1114|port311": [
        "chokepoint7"
    ],
    "port1201|port311": [
        "chokepoint7"
    ],
    "port909|port1114": [
        "chokepoint8"
    ],
    "port909|port57": [
        "chokepoint8"
    ],
    "port909|port446": [
        "chokepoint8"
    ],
    "port23|port1114": [
        "chokepoint8"
    ],
    "port1114|port909": [
        "chokepoint8"
    ],
    "port57|port909": [
        "chokepoint8"
    ],
    "port446|port909": [
        "chokepoint8"
    ],
    "port1265|port909": [
        "chokepoint8"
    ],
    "port1265|port1114": [
        "chokepoint8"
    ],
    "port1201|port568": [
        "chokepoint5"
    ],
    "port568|port1188": [
        "chokepoint15"
    ],
    "port568|port474": [
        "chokepoint15"
    ],
    "port504|port909": [
        "chokepoint3"
    ],
    "port504|port1114": [
        "chokepoint3",
        "chokepoint8"
    ],
    "port909|port504": [
        "chokepoint3"
    ],
    "port481|port1201": [
        "chokepoint2"
    ],
    "port481|port1188": [
        "chokepoint2",
        "chokepoint11"
    ],
    "port1201|port481": [
        "chokepoint2"
    ]
}


def legacy_route_chokepoints() -> dict[tuple[str, str], list[str]]:
    out: dict[tuple[str, str], list[str]] = {}
    for key, value in _LEGACY_ROUTE_CHOKEPOINTS_RAW.items():
        a, b = key.split("|", 1)
        out[(a, b)] = list(value)
    return out
