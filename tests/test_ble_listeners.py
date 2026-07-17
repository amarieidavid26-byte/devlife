"""Fiecare reconectare BLE resubscrie pe aceeasi caracteristica. addEventListener sare
peste un (tip, listener) deja inregistrat doar daca functia e identica, deci handler-ele
trebuie sa fie referinte stabile din constructor -- cu un arrow nou la fiecare apel,
listenerele se adunau si un singur cadru BLE intra de N ori in RMSSD (diferentele dintre
duplicate sunt 0, deci HRV-ul live scadea artificial dupa fiecare reconectare).

Anti-drift peste frontend/src/network/WHOOPBluetooth.js -- aceeasi abordare ca verificarea
cascadei ESC din test_escape_cascade.py.
"""

import re
from pathlib import Path

import pytest

BLE_JS = Path(__file__).parent.parent / "frontend" / "src" / "network" / "WHOOPBluetooth.js"


@pytest.fixture(scope="module")
def src():
    return BLE_JS.read_text()


def test_heart_rate_subscription_uses_a_stable_handler_reference(src):
    m = re.search(r"addEventListener\(\s*'characteristicvaluechanged'\s*,\s*([^)]+)\)", src)
    assert m, "subscrierea la characteristicvaluechanged a disparut"
    assert "_onHeartRateBound" in m.group(1), \
        "handler-ul de HR trebuie sa fie referinta stabila din constructor, nu un arrow nou"


def test_gatt_disconnect_uses_a_stable_handler_reference(src):
    m = re.search(r"addEventListener\(\s*'gattserverdisconnected'\s*,\s*([^)]+)\)", src)
    assert m, "handler-ul de gattserverdisconnected a disparut"
    assert "_onGattDisconnectedBound" in m.group(1), \
        "handler-ul de deconectare trebuie sa fie referinta stabila, altfel se aduna la re-pairing"


def test_bound_handlers_are_created_once_in_the_constructor(src):
    ctor = re.search(r"constructor\(\)\s*\{(.*?)\n    \}", src, re.S)
    assert ctor, "nu am gasit constructorul"
    assert "_onHeartRateBound" in ctor.group(1)
    assert "_onGattDisconnectedBound" in ctor.group(1)


def test_no_inline_arrow_is_registered_as_an_event_listener(src):
    inline = re.findall(r"addEventListener\(\s*'[^']+'\s*,\s*(?:\([^)]*\)|\w+)\s*=>", src)
    # visibilitychange se inregistreaza o singura data, pazit de _visibilityWired
    assert [a for a in inline] == [] or "_visibilityWired" in src
    for ev in ("characteristicvaluechanged", "gattserverdisconnected"):
        assert not re.search(rf"addEventListener\(\s*'{ev}'\s*,\s*\([^)]*\)\s*=>", src), \
            f"{ev} s-a intors la un arrow inline -- listenerele se vor aduna la reconectare"
