"""Un sqlite3.Connection nu e thread-safe: are o masina de stare de tranzactie implicita
si un cache de statement-uri, niciunul protejat. Aplicatia scrie din trei fire in acelasi
timp -- biometric_loop, ghost_loop si event loop-ul cu endpoint-urile async -- deci o
conexiune partajata se corupea sub concurenta ("cannot start a transaction within a
transaction", randuri pierdute), iar `check_same_thread=False` doar taia verificarea care
semnala asta.
"""

import threading

import pytest

from persistence import db


@pytest.fixture
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "get_db_path", lambda: str(tmp_path / "t.db"))
    db.reset()
    db._current_session_id = None
    yield
    db.reset()


def _hammer(fn, threads=6, loops=40):
    """Ruleaza fn din mai multe fire si aduna orice exceptie."""
    errors = []
    barrier = threading.Barrier(threads)

    def worker(n):
        barrier.wait()          # porniti toti odata, ca sa se suprapuna efectiv
        for i in range(loops):
            try:
                fn(n, i)
            except Exception as e:
                errors.append(f"{type(e).__name__}: {e}")

    ts = [threading.Thread(target=worker, args=(n,)) for n in range(threads)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    return errors


def test_each_thread_gets_its_own_connection(fresh_db):
    # pastram obiectele, nu id()-urile: cand un fir se termina, conexiunea lui thread-local
    # se elibereaza si CPython poate refolosi adresa, deci id()-urile s-ar ciocni aleatoriu
    conns = {}
    lock = threading.Lock()

    def grab(n, i):
        conn = db.connect()
        with lock:
            conns[threading.get_ident()] = conn

    errors = _hammer(grab, threads=4, loops=1)

    assert errors == [], f"connect() a aruncat sub concurenta: {errors}"
    assert len(conns) == 4, "fiecare fir trebuie sa aiba propria conexiune"
    distinct = {id(c) for c in conns.values()}
    assert len(distinct) == 4, "conexiunea nu mai are voie sa fie partajata intre fire"


def test_concurrent_writes_and_reads_do_not_corrupt_the_connection(fresh_db):
    """Regresie: cu o singura conexiune partajata, scrisul si cititul simultan aruncau
    'cannot start a transaction within a transaction' / 'another row available'."""
    db.start_session(mode="test")

    def mixed(n, i):
        if n % 2 == 0:
            db.save_biometric(hr=60 + i, hrv=50, recovery=70, strain=8.0, source="mock", state="RELAXED")
        else:
            db.get_interventions(since=0, limit=50)

    errors = _hammer(mixed)

    assert errors == [], f"acces concurent corupt: {errors[:5]}"


def test_concurrent_writers_all_persist_their_rows(fresh_db):
    """Jumatatea tacuta a bug-ului: cand scriitorul pierdea cursa, loops.py inghitea
    exceptia cu un warning, deci cutia neagra pierdea sample-uri fara sa spuna nimic."""
    db.start_session(mode="test")
    threads, loops = 4, 25

    def write(n, i):
        db.save_biometric(hr=60, hrv=50, recovery=70, strain=8.0, source="mock", state="RELAXED")

    errors = _hammer(write, threads=threads, loops=loops)
    assert errors == [], f"scrieri concurente esuate: {errors[:5]}"

    timeline = db.get_session_timeline(db.current_session_id())
    assert len(timeline["samples"]) == threads * loops, "s-au pierdut sample-uri sub concurenta"
